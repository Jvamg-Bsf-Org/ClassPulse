from collections import defaultdict
from typing import Any
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        # aula_id -> list of active WebSockets
        self.active_connections: dict[int, list[WebSocket]] = defaultdict(list)

    async def connect(self, aula_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections[aula_id].append(websocket)

    def disconnect(self, aula_id: int, websocket: WebSocket) -> None:
        if websocket in self.active_connections[aula_id]:
            self.active_connections[aula_id].remove(websocket)
            if not self.active_connections[aula_id]:
                del self.active_connections[aula_id]

    async def broadcast(self, aula_id: int, message: dict[str, Any]) -> None:
        for connection in list(self.active_connections.get(aula_id, [])):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(aula_id, connection)


manager = ConnectionManager()
