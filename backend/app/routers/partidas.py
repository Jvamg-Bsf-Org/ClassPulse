from datetime import datetime, timedelta
import random
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.ws_manager import manager
from app.db import get_session
from app.deps import get_current_aluno, get_current_professor, get_current_user
from app.models import (
    Alternativa,
    Aluno,
    Aula,
    Grupo,
    GrupoMembro,
    ModoAula,
    ModoExecucaoQuiz,
    Participacao,
    Partida,
    PartidaPulo,
    Pergunta,
    Professor,
    Quiz,
    Resposta,
    StatusPartida,
    Turma,
)
from app.schemas import (
    AlternativaAlunoRead,
    AlternativaRead,
    GrupoInfo,
    PartidaAlunoStatusRead,
    PartidaIniciarRequest,
    PartidaProfessorStatusRead,
    PartidaResultadoRead,
    PerguntaAlunoRead,
    PerguntaRead,
    RankingItem,
    RespostaFeedback,
    RespostaSubmitRequest,
)

router = APIRouter(prefix="/partidas", tags=["partidas"])


@router.post("/aula/{aula_id}/iniciar", response_model=PartidaProfessorStatusRead)
async def iniciar_partida(
    aula_id: int,
    dados: PartidaIniciarRequest,
    professor: Professor = Depends(get_current_professor),
    session: Session = Depends(get_session),
) -> PartidaProfessorStatusRead:
    aula = session.get(Aula, aula_id)
    if not aula:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Aula não encontrada")

    turma = session.get(Turma, aula.turma_id)
    if not turma or turma.professor_id != professor.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Não autorizado para esta aula")

    quiz = session.get(Quiz, dados.quiz_id)
    if not quiz:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz não encontrado")

    # Encerrar partida anterior se houver
    partida_anterior = session.exec(
        select(Partida).where(
            Partida.aula_id == aula_id,
            Partida.status == StatusPartida.em_andamento,
        )
    ).first()
    if partida_anterior:
        partida_anterior.status = StatusPartida.encerrada
        partida_anterior.encerrada_em = datetime.utcnow()
        session.add(partida_anterior)
        session.commit()

    # Mudar modo da aula para atividade
    aula.modo_atual = ModoAula.atividade
    session.add(aula)

    modo_execucao = dados.modo_execucao or quiz.modo_execucao
    competitivo = dados.competitivo if dados.competitivo is not None else quiz.competitivo
    obrigatorio = dados.obrigatorio if dados.obrigatorio is not None else quiz.obrigatorio
    meta_coletiva = (
        dados.meta_coletiva_percentual
        if dados.meta_coletiva_percentual is not None
        else quiz.meta_coletiva_percentual
    )

    now = datetime.utcnow()
    discussao_ate = now + timedelta(seconds=60) if modo_execucao == ModoExecucaoQuiz.grupo else None
    expira_em = (
        now + timedelta(seconds=dados.tempo_limite_segundos)
        if dados.tempo_limite_segundos
        else None
    )

    partida = Partida(
        aula_id=aula_id,
        quiz_id=quiz.id,
        status=StatusPartida.em_andamento,
        modo_execucao=modo_execucao,
        competitivo=competitivo,
        obrigatorio=obrigatorio,
        meta_coletiva_percentual=meta_coletiva,
        tempo_limite_segundos=dados.tempo_limite_segundos,
        discussao_ate=discussao_ate,
        expira_em=expira_em,
        iniciada_em=now,
    )
    session.add(partida)
    session.commit()
    session.refresh(partida)

    # Se modo grupo, alocar duplas/trios entre os participantes
    grupos_count = 0
    if modo_execucao == ModoExecucaoQuiz.grupo:
        participacoes = session.exec(
            select(Participacao).where(Participacao.aula_id == aula_id)
        ).all()
        parts = list(participacoes)
        random.shuffle(parts)

        # Dividir em duplas (e trio no final se ímpar)
        grupos_list = []
        i = 0
        while i < len(parts):
            if len(parts) - i == 3:
                grupos_list.append(parts[i : i + 3])
                break
            grupos_list.append(parts[i : i + 2])
            i += 2

        for idx, equipe in enumerate(grupos_list):
            grupo = Grupo(
                partida_id=partida.id,
                nome_ou_numero=f"Equipe {idx + 1}",
            )
            session.add(grupo)
            session.commit()
            session.refresh(grupo)
            grupos_count += 1

            for p in equipe:
                session.add(GrupoMembro(grupo_id=grupo.id, participacao_id=p.id))
            session.commit()

    # Broadcast via WebSocket
    await manager.broadcast(
        aula_id,
        {
            "evento": "partida_iniciada",
            "partida_id": partida.id,
            "quiz_titulo": quiz.titulo,
            "modo": modo_execucao.value,
            "obrigatorio": obrigatorio,
            "competitivo": competitivo,
        },
    )

    return await obter_status_professor(partida.id, professor, session)


@router.get("/aula/{aula_id}/aluno-status", response_model=PartidaAlunoStatusRead)
def obter_status_aluno(
    aula_id: int,
    aluno: Aluno = Depends(get_current_aluno),
    session: Session = Depends(get_session),
) -> PartidaAlunoStatusRead:
    partida = session.exec(
        select(Partida)
        .where(Partida.aula_id == aula_id, Partida.status == StatusPartida.em_andamento)
        .order_by(Partida.id.desc())
    ).first()

    if not partida:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nenhuma partida em andamento para esta aula")

    participacao = session.exec(
        select(Participacao).where(
            Participacao.aula_id == aula_id,
            Participacao.aluno_id == aluno.id,
        )
    ).first()
    if not participacao:
        participacao = Participacao(aula_id=aula_id, aluno_id=aluno.id)
        session.add(participacao)
        session.commit()
        session.refresh(participacao)

    # Verificar se pulou
    pulou = (
        session.exec(
            select(PartidaPulo).where(
                PartidaPulo.partida_id == partida.id,
                PartidaPulo.participacao_id == participacao.id,
            )
        ).first()
        is not None
    )

    quiz = session.get(Quiz, partida.quiz_id)
    now = datetime.utcnow()

    # Cálculo dos tempos
    segundos_discussao = 0
    pode_enviar = True
    if partida.discussao_ate:
        delta = (partida.discussao_ate - now).total_seconds()
        segundos_discussao = max(0, int(delta))
        pode_enviar = segundos_discussao == 0

    segundos_totais = None
    if partida.expira_em:
        delta_total = (partida.expira_em - now).total_seconds()
        segundos_totais = max(0, int(delta_total))
        if segundos_totais == 0:
            pode_enviar = False

    # Informações do grupo (se aplicável)
    grupo_info = None
    grupo_id = None
    if partida.modo_execucao == ModoExecucaoQuiz.grupo:
        membro = session.exec(
            select(GrupoMembro)
            .join(Grupo, Grupo.id == GrupoMembro.grupo_id)
            .where(
                Grupo.partida_id == partida.id,
                GrupoMembro.participacao_id == participacao.id,
            )
        ).first()
        if membro:
            grupo_id = membro.grupo_id
            grupo = session.get(Grupo, grupo_id)
            colegas = session.exec(
                select(Aluno)
                .join(Participacao, Participacao.aluno_id == Aluno.id)
                .join(GrupoMembro, GrupoMembro.participacao_id == Participacao.id)
                .where(GrupoMembro.grupo_id == grupo_id)
            ).all()
            grupo_info = GrupoInfo(
                id=grupo.id,
                nome_ou_numero=grupo.nome_ou_numero,
                membros=[c.nome for c in colegas],
            )

    # Perguntas (formato aluno, sem respostas corretas ou explicação)
    perguntas_db = session.exec(
        select(Pergunta).where(Pergunta.quiz_id == quiz.id).order_by(Pergunta.ordem)
    ).all()
    perguntas_aluno = []
    for p in perguntas_db:
        alts = session.exec(select(Alternativa).where(Alternativa.pergunta_id == p.id)).all()
        perguntas_aluno.append(
            PerguntaAlunoRead(
                id=p.id,
                enunciado=p.enunciado,
                tipo=p.tipo,
                ordem=p.ordem,
                pontos=p.pontos,
                alternativas=[AlternativaAlunoRead(id=a.id, texto=a.texto) for a in alts],
            )
        )

    # Respostas já salvas
    if partida.modo_execucao == ModoExecucaoQuiz.grupo and grupo_id:
        respostas_db = session.exec(
            select(Resposta).where(
                Resposta.partida_id == partida.id,
                Resposta.grupo_id == grupo_id,
            )
        ).all()
    else:
        respostas_db = session.exec(
            select(Resposta).where(
                Resposta.partida_id == partida.id,
                Resposta.participacao_id == participacao.id,
            )
        ).all()

    respostas_map = {r.pergunta_id: r.alternativa_id for r in respostas_db}

    return PartidaAlunoStatusRead(
        id=partida.id,
        aula_id=partida.aula_id,
        quiz_titulo=quiz.titulo,
        status=partida.status,
        modo_execucao=partida.modo_execucao,
        competitivo=partida.competitivo,
        obrigatorio=partida.obrigatorio,
        meta_coletiva_percentual=partida.meta_coletiva_percentual,
        iniciada_em=partida.iniciada_em,
        discussao_ate=partida.discussao_ate,
        expira_em=partida.expira_em,
        segundos_discussao_restantes=segundos_discussao,
        segundos_totais_restantes=segundos_totais,
        pode_enviar_resposta=pode_enviar,
        pulou=pulou,
        grupo=grupo_info,
        perguntas=perguntas_aluno,
        respostas_enviadas=respostas_map,
    )


@router.post("/{partida_id}/responder", response_model=RespostaFeedback)
async def responder_pergunta(
    partida_id: int,
    dados: RespostaSubmitRequest,
    aluno: Aluno = Depends(get_current_aluno),
    session: Session = Depends(get_session),
) -> RespostaFeedback:
    partida = session.get(Partida, partida_id)
    if not partida or partida.status != StatusPartida.em_andamento:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Partida não está em andamento")

    now = datetime.utcnow()
    if partida.expira_em and now > partida.expira_em:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tempo limite para respostas esgotado")

    if partida.discussao_ate and now < partida.discussao_ate:
        segundos = int((partida.discussao_ate - now).total_seconds())
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Aguarde o período de discussão presencial ({segundos}s restantes) para responder",
        )

    participacao = session.exec(
        select(Participacao).where(
            Participacao.aula_id == partida.aula_id,
            Participacao.aluno_id == aluno.id,
        )
    ).first()
    if not participacao:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Aluno não matriculado nesta aula")

    pergunta = session.get(Pergunta, dados.pergunta_id)
    if not pergunta or pergunta.quiz_id != partida.quiz_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pergunta inválida para este quiz")

    correta = False
    if dados.alternativa_id:
        alt = session.get(Alternativa, dados.alternativa_id)
        if not alt or alt.pergunta_id != pergunta.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Alternativa inválida")
        correta = alt.correta

    # Verificar grupo
    grupo_id = None
    if partida.modo_execucao == ModoExecucaoQuiz.grupo:
        membro = session.exec(
            select(GrupoMembro)
            .join(Grupo, Grupo.id == GrupoMembro.grupo_id)
            .where(
                Grupo.partida_id == partida.id,
                GrupoMembro.participacao_id == participacao.id,
            )
        ).first()
        if membro:
            grupo_id = membro.grupo_id

    # Busca resposta anterior para atualizar ou criar nova
    if partida.modo_execucao == ModoExecucaoQuiz.grupo and grupo_id:
        resposta_existente = session.exec(
            select(Resposta).where(
                Resposta.partida_id == partida.id,
                Resposta.pergunta_id == pergunta.id,
                Resposta.grupo_id == grupo_id,
            )
        ).first()
    else:
        resposta_existente = session.exec(
            select(Resposta).where(
                Resposta.partida_id == partida.id,
                Resposta.pergunta_id == pergunta.id,
                Resposta.participacao_id == participacao.id,
            )
        ).first()

    if resposta_existente:
        resposta_existente.alternativa_id = dados.alternativa_id
        resposta_existente.resposta_texto = dados.resposta_texto
        resposta_existente.correta = correta
        resposta_existente.respondido_em = now
        session.add(resposta_existente)
    else:
        nova_resposta = Resposta(
            partida_id=partida.id,
            pergunta_id=pergunta.id,
            participacao_id=participacao.id if not grupo_id else None,
            grupo_id=grupo_id,
            alternativa_id=dados.alternativa_id,
            resposta_texto=dados.resposta_texto,
            correta=correta,
            respondido_em=now,
        )
        session.add(nova_resposta)

    session.commit()

    # Notificar via WebSocket
    await manager.broadcast(
        partida.aula_id,
        {
            "evento": "resposta_registrada",
            "partida_id": partida.id,
            "pergunta_id": pergunta.id,
            "grupo_id": grupo_id,
            "alternativa_id": dados.alternativa_id,
        },
    )

    return RespostaFeedback(
        pergunta_id=pergunta.id,
        salva=True,
        mensagem="Resposta salva com sucesso",
    )


@router.post("/{partida_id}/pular", response_model=dict)
async def pular_partida(
    partida_id: int,
    aluno: Aluno = Depends(get_current_aluno),
    session: Session = Depends(get_session),
) -> dict:
    partida = session.get(Partida, partida_id)
    if not partida or partida.status != StatusPartida.em_andamento:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Partida não encontrada ou já encerrada")

    if partida.obrigatorio:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Esta atividade é obrigatória")

    participacao = session.exec(
        select(Participacao).where(
            Participacao.aula_id == partida.aula_id,
            Participacao.aluno_id == aluno.id,
        )
    ).first()
    if not participacao:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Aluno não matriculado")

    ja_pulou = session.exec(
        select(PartidaPulo).where(
            PartidaPulo.partida_id == partida.id,
            PartidaPulo.participacao_id == participacao.id,
        )
    ).first()

    if not ja_pulou:
        session.add(PartidaPulo(partida_id=partida.id, participacao_id=participacao.id))
        session.commit()

    return {"status": "ok", "mensagem": "Atividade ignorada. Seu Score de Foco está preservado."}


@router.get("/{partida_id}/professor-status", response_model=PartidaProfessorStatusRead)
async def obter_status_professor(
    partida_id: int,
    professor: Professor = Depends(get_current_professor),
    session: Session = Depends(get_session),
) -> PartidaProfessorStatusRead:
    partida = session.get(Partida, partida_id)
    if not partida:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Partida não encontrada")

    aula = session.get(Aula, partida.aula_id)
    turma = session.get(Turma, aula.turma_id)
    if turma.professor_id != professor.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Não autorizado")

    quiz = session.get(Quiz, partida.quiz_id)
    total_perguntas = len(
        session.exec(select(Pergunta).where(Pergunta.quiz_id == quiz.id)).all()
    )

    participacoes = session.exec(
        select(Participacao).where(Participacao.aula_id == aula.id)
    ).all()
    pulos = session.exec(
        select(PartidaPulo).where(PartidaPulo.partida_id == partida.id)
    ).all()
    pulos_count = len(pulos)
    total_participantes = len(participacoes)

    grupos = session.exec(select(Grupo).where(Grupo.partida_id == partida.id)).all()
    grupos_count = len(grupos)

    if partida.modo_execucao == ModoExecucaoQuiz.grupo:
        respostas_esperadas = grupos_count * total_perguntas
    else:
        ativos = max(0, total_participantes - pulos_count)
        respostas_esperadas = ativos * total_perguntas

    respostas = session.exec(
        select(Resposta).where(Resposta.partida_id == partida.id)
    ).all()
    respostas_recebidas = len(respostas)
    acertos = sum(1 for r in respostas if r.correta)

    percentual_acertos = 0.0
    if respostas_recebidas > 0:
        percentual_acertos = round((acertos / respostas_recebidas) * 100, 1)

    meta_atingida = False
    if partida.meta_coletiva_percentual:
        meta_atingida = percentual_acertos >= partida.meta_coletiva_percentual

    return PartidaProfessorStatusRead(
        id=partida.id,
        aula_id=partida.aula_id,
        quiz_id=partida.quiz_id,
        quiz_titulo=quiz.titulo,
        status=partida.status,
        modo_execucao=partida.modo_execucao,
        competitivo=partida.competitivo,
        obrigatorio=partida.obrigatorio,
        meta_coletiva_percentual=partida.meta_coletiva_percentual,
        iniciada_em=partida.iniciada_em,
        discussao_ate=partida.discussao_ate,
        expira_em=partida.expira_em,
        total_participantes=total_participantes,
        total_respostas_esperadas=respostas_esperadas,
        total_respostas_recebidas=respostas_recebidas,
        total_acertos=acertos,
        percentual_acertos_atual=percentual_acertos,
        meta_atingida=meta_atingida,
        grupos_count=grupos_count,
    )


@router.post("/{partida_id}/encerrar", response_model=PartidaResultadoRead)
async def encerrar_partida(
    partida_id: int,
    professor: Professor = Depends(get_current_professor),
    session: Session = Depends(get_session),
) -> PartidaResultadoRead:
    partida = session.get(Partida, partida_id)
    if not partida:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Partida não encontrada")

    aula = session.get(Aula, partida.aula_id)
    turma = session.get(Turma, aula.turma_id)
    if turma.professor_id != professor.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Não autorizado")

    partida.status = StatusPartida.encerrada
    partida.encerrada_em = datetime.utcnow()
    session.add(partida)

    # Voltar modo da aula para livre ou foco
    aula.modo_atual = ModoAula.livre
    session.add(aula)

    # Consolidar score_aprendizagem para cada aluno na Participacao
    quiz = session.get(Quiz, partida.quiz_id)
    perguntas = session.exec(select(Pergunta).where(Pergunta.quiz_id == quiz.id)).all()
    total_perguntas = len(perguntas)

    participacoes = session.exec(
        select(Participacao).where(Participacao.aula_id == aula.id)
    ).all()

    for p in participacoes:
        # Se aluno pulou partida opcional, não altera score
        pulou = session.exec(
            select(PartidaPulo).where(
                PartidaPulo.partida_id == partida.id,
                PartidaPulo.participacao_id == p.id,
            )
        ).first()
        if pulou:
            continue

        if partida.modo_execucao == ModoExecucaoQuiz.grupo:
            membro = session.exec(
                select(GrupoMembro)
                .join(Grupo, Grupo.id == GrupoMembro.grupo_id)
                .where(
                    Grupo.partida_id == partida.id,
                    GrupoMembro.participacao_id == p.id,
                )
            ).first()
            if membro:
                respostas = session.exec(
                    select(Resposta).where(
                        Resposta.partida_id == partida.id,
                        Resposta.grupo_id == membro.grupo_id,
                    )
                ).all()
            else:
                respostas = []
        else:
            respostas = session.exec(
                select(Resposta).where(
                    Resposta.partida_id == partida.id,
                    Resposta.participacao_id == p.id,
                )
            ).all()

        acertos = sum(1 for r in respostas if r.correta)
        # Nota de 0 a 100 baseada em acertos
        nota = int((acertos / total_perguntas) * 100) if total_perguntas > 0 else 0
        p.score_aprendizagem = nota
        session.add(p)

    session.commit()

    # Notificar encerramento via WebSocket
    await manager.broadcast(
        aula.id,
        {
            "evento": "partida_encerrada",
            "partida_id": partida.id,
        },
    )

    return _calcular_resultado_partida(partida.id, aluno=None, session=session)


def _calcular_resultado_partida(
    partida_id: int,
    aluno: Aluno | None,
    session: Session,
) -> PartidaResultadoRead:
    partida = session.get(Partida, partida_id)
    if not partida:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Partida não encontrada")

    quiz = session.get(Quiz, partida.quiz_id)
    perguntas_db = session.exec(
        select(Pergunta).where(Pergunta.quiz_id == quiz.id).order_by(Pergunta.ordem)
    ).all()
    total_perguntas = len(perguntas_db)


    # Gabarito completo com explicação
    gabarito = []
    for p in perguntas_db:
        alts = session.exec(select(Alternativa).where(Alternativa.pergunta_id == p.id)).all()
        gabarito.append(
            PerguntaRead(
                id=p.id,
                quiz_id=p.quiz_id,
                enunciado=p.enunciado,
                tipo=p.tipo,
                ordem=p.ordem,
                pontos=p.pontos,
                explicacao=p.explicacao,
                alternativas=[
                    AlternativaRead(id=a.id, texto=a.texto, correta=a.correta) for a in alts
                ],
            )
        )

    # Estatísticas gerais da turma
    todas_respostas = session.exec(
        select(Resposta).where(Resposta.partida_id == partida.id)
    ).all()
    total_respostas = len(todas_respostas)
    acertos_totais = sum(1 for r in todas_respostas if r.correta)
    percentual_turma = (
        round((acertos_totais / total_respostas) * 100, 1) if total_respostas > 0 else 0.0
    )
    meta_atingida = (
        percentual_turma >= partida.meta_coletiva_percentual
        if partida.meta_coletiva_percentual
        else False
    )

    # Estatísticas do aluno solicitante (se for aluno)
    pontos_individual = 0
    acertos_individual = 0
    if aluno:
        participacao = session.exec(
            select(Participacao).where(
                Participacao.aula_id == partida.aula_id,
                Participacao.aluno_id == aluno.id,
            )
        ).first()
        if participacao:
            if partida.modo_execucao == ModoExecucaoQuiz.grupo:
                membro = session.exec(
                    select(GrupoMembro)
                    .join(Grupo, Grupo.id == GrupoMembro.grupo_id)
                    .where(
                        Grupo.partida_id == partida.id,
                        GrupoMembro.participacao_id == participacao.id,
                    )
                ).first()
                if membro:
                    resps_aluno = [r for r in todas_respostas if r.grupo_id == membro.grupo_id]
                else:
                    resps_aluno = []
            else:
                resps_aluno = [
                    r for r in todas_respostas if r.participacao_id == participacao.id
                ]

            acertos_individual = sum(1 for r in resps_aluno if r.correta)
            pontos_individual = acertos_individual * 100

    # Ranking (se competitivo)
    ranking = None
    if partida.competitivo:
        ranking = []
        if partida.modo_execucao == ModoExecucaoQuiz.grupo:
            grupos = session.exec(select(Grupo).where(Grupo.partida_id == partida.id)).all()
            for g in grupos:
                r_grupo = [r for r in todas_respostas if r.grupo_id == g.id]
                ac_g = sum(1 for r in r_grupo if r.correta)
                ranking.append({"nome": g.nome_ou_numero, "acertos": ac_g, "pontos": ac_g * 100})
        else:
            parts = session.exec(
                select(Participacao).where(Participacao.aula_id == partida.aula_id)
            ).all()
            for p in parts:
                aluno_p = session.get(Aluno, p.aluno_id)
                r_p = [r for r in todas_respostas if r.participacao_id == p.id]
                ac_p = sum(1 for r in r_p if r.correta)
                ranking.append(
                    {
                        "nome": aluno_p.nome if aluno_p else "Aluno",
                        "acertos": ac_p,
                        "pontos": ac_p * 100,
                    }
                )

        ranking.sort(key=lambda x: x["pontos"], reverse=True)
        ranking = [
            RankingItem(posicao=idx + 1, nome=item["nome"], pontos=item["pontos"], acertos=item["acertos"])
            for idx, item in enumerate(ranking)
        ]

    return PartidaResultadoRead(
        partida_id=partida.id,
        status=partida.status,
        modo_execucao=partida.modo_execucao,
        competitivo=partida.competitivo,
        pontuacao_individual=pontos_individual,
        acertos_individual=acertos_individual,
        total_perguntas=total_perguntas,
        meta_coletiva_percentual=partida.meta_coletiva_percentual,
        percentual_turma=percentual_turma,
        meta_coletiva_atingida=meta_atingida,
        gabarito=gabarito,
        ranking=ranking,
    )


@router.get("/{partida_id}/resultados", response_model=PartidaResultadoRead)
def obter_resultado_partida(
    partida_id: int,
    user_info: tuple[str, Aluno | Professor] = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> PartidaResultadoRead:
    tipo, usuario = user_info
    aluno = usuario if tipo == "aluno" else None
    return _calcular_resultado_partida(partida_id, aluno=aluno, session=session)

