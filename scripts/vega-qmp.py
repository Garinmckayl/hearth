import argparse
import json
import socket
import time


def exchange(connection, stream, command, arguments=None):
    request = {"execute": command, "id": command}
    if arguments is not None:
        request["arguments"] = arguments
    connection.sendall(json.dumps(request).encode() + b"\n")
    while True:
        response = json.loads(stream.readline())
        if response.get("id") == command:
            if "error" in response:
                raise RuntimeError(response["error"])
            return response.get("return")


def main():
    parser = argparse.ArgumentParser(description="Send a key through the official simulator's local QMP socket.")
    parser.add_argument("key", choices=["up", "down", "left", "right", "kp_enter", "esc"])
    parser.add_argument("--socket", default="/tmp/qmp-socket-5554.sock")
    arguments = parser.parse_args()
    with socket.socket(socket.AF_UNIX) as connection:
        connection.settimeout(10)
        connection.connect(arguments.socket)
        with connection.makefile("rb") as stream:
            json.loads(stream.readline())
            exchange(connection, stream, "qmp_capabilities")
            for pressed in [True, False]:
                exchange(connection, stream, "input-send-event", {"events": [{
                    "type": "key", "data": {"down": pressed, "key": {"type": "qcode", "data": arguments.key}}
                }]})
                time.sleep(0.1)
    print(f"Sent {arguments.key} to the official simulator")


if __name__ == "__main__":
    main()
