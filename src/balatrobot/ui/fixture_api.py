"""Deterministic offline JSON-RPC contract fixture for the visualizer."""

import copy
import json
from pathlib import Path
from typing import Any

FIXTURE_DIR = Path(__file__).parent / "static" / "fixtures"
CONTRACT_PATH = FIXTURE_DIR / "openrpc.json"
GAMESTATES_PATH = FIXTURE_DIR / "gamestates.json"


def _error(code: int, name: str, message: str, request_id: object) -> dict[str, Any]:
    return {
        "jsonrpc": "2.0",
        "error": {"code": code, "message": message, "data": {"name": name}},
        "id": request_id,
    }


class FixtureApi:
    """Validate calls against OpenRPC and return synthetic screen fixtures."""

    def __init__(
        self,
        contract_path: Path = CONTRACT_PATH,
        gamestates_path: Path = GAMESTATES_PATH,
    ) -> None:
        self.contract = json.loads(contract_path.read_text())
        fixture_document = json.loads(gamestates_path.read_text())
        self.gamestates = fixture_document["states"]
        self.methods = {method["name"]: method for method in self.contract["methods"]}

    def dispatch(self, body: bytes, fixture_state: str | None) -> dict[str, Any]:
        """Dispatch one JSON-RPC request without contacting a game server."""
        try:
            request = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError):
            return _error(-32700, "PARSE_ERROR", "Invalid JSON", None)

        if not isinstance(request, dict):
            return _error(-32600, "INVALID_REQUEST", "Request must be an object", None)

        request_id = request.get("id")
        method_name = request.get("method")
        params = request.get("params", {})
        if request.get("jsonrpc") != "2.0" or not isinstance(method_name, str):
            return _error(
                -32600,
                "INVALID_REQUEST",
                "Expected jsonrpc '2.0' and a string method",
                request_id,
            )
        if not isinstance(params, dict):
            return _error(
                -32602, "INVALID_PARAMS", "params must be an object", request_id
            )

        method = self.methods.get(method_name)
        if method is None:
            return _error(
                -32601,
                "METHOD_NOT_FOUND",
                f"Unknown fixture method '{method_name}'",
                request_id,
            )

        validation_error = self._validate_params(method, params)
        if validation_error is not None:
            return _error(-32602, "INVALID_PARAMS", validation_error, request_id)

        if method_name == "rpc.discover":
            result: Any = self.contract
        elif method_name == "health":
            result = {"status": "ok", "fixture": True}
        elif method["result"]["schema"].get("$ref", "").endswith("/PathResult"):
            result = {"success": True, "path": params["path"]}
        else:
            gamestate = self.gamestates.get(fixture_state or "MENU")
            if gamestate is None:
                return _error(
                    -32602,
                    "INVALID_PARAMS",
                    f"Unknown fixture state '{fixture_state}'",
                    request_id,
                )
            result = copy.deepcopy(gamestate)
            result["fixture"] = {"synthetic": True, "last_method": method_name}

        return {"jsonrpc": "2.0", "result": result, "id": request_id}

    def _validate_params(
        self, method: dict[str, Any], params: dict[str, Any]
    ) -> str | None:
        definitions = {parameter["name"]: parameter for parameter in method["params"]}
        unknown = sorted(set(params) - set(definitions))
        if unknown:
            return f"Unknown parameter: {unknown[0]}"

        for name, parameter in definitions.items():
            if parameter.get("required") and name not in params:
                return f"Missing required parameter: {name}"
            if name in params and not self._matches_schema(
                params[name], parameter["schema"]
            ):
                return f"Parameter '{name}' does not match its OpenRPC schema"
        return None

    def _matches_schema(self, value: Any, schema: dict[str, Any]) -> bool:
        if "$ref" in schema:
            prefix = "#/components/schemas/"
            reference = schema["$ref"]
            if not reference.startswith(prefix):
                return True
            schema_name = reference.removeprefix(prefix)
            resolved = self.contract["components"]["schemas"][schema_name]
            return self._matches_schema(value, resolved)

        if "oneOf" in schema:
            return any(
                self._matches_schema(value, option) for option in schema["oneOf"]
            )
        if "const" in schema and value != schema["const"]:
            return False
        if "enum" in schema and value not in schema["enum"]:
            return False

        expected_type = schema.get("type")
        if expected_type == "string" and not isinstance(value, str):
            return False
        if expected_type == "boolean" and not isinstance(value, bool):
            return False
        if expected_type == "integer" and (
            not isinstance(value, int) or isinstance(value, bool)
        ):
            return False
        if expected_type == "array":
            if not isinstance(value, list):
                return False
            if len(value) < schema.get("minItems", 0):
                return False
            if "items" in schema and not all(
                self._matches_schema(item, schema["items"]) for item in value
            ):
                return False

        if "minimum" in schema and value < schema["minimum"]:
            return False
        return True
