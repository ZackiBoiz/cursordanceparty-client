const WebSocket = require("ws");

Math.clamp = (min, num, max) => {
    return Math.min(Math.max(num, min), max);
};

const CursorTypes = {
    DEFAULT: 0,
    CURSOR: 0,
    GUN: 1,
    THREE: 1,
    FOUR: 2,
    HAND_BACK: 3,
    FIVE: 3,
    HORNS_FRONT: 4,
    POINTER_FRONT: 5,
    HAND_FRONT: 6,
    HORNS_BACK: 7,
    FIST_BACK: 8,
    POINTER_BACK: 9,
    SHAKA: 10,
    FIST_FRONT: 11,
    THUMB: 12,
    THUMB_BACK: 12,
    WAIT: 13,
    PROGRESS: 13,
    TIMER: 13,
};

class CursorDancePartyHandler {
    constructor(uri, origin) {
        this.uri = uri;
        this.origin = origin;
        this.socket = null;
        this.ping_interval = null;
        this.ping_sent = null;
        this.handlers = {};
        this.mouse = { x: 0, y: 0, angle: 0, cursor: 0, scale: 0.15, rotations: 0 };
        this.last_mouse = "";

        this.connected = false;
        this.clients = [];
    }

    async connect() {
        return new Promise(async (res) => {
            const polling_res = await fetch(`${this.origin}/socket.io/?EIO=3&transport=polling`);
            const cookies = Object.fromEntries((polling_res.headers.get("set-cookie") || '').split('; ').map(cookie => cookie.split('=').map(part => part.trim())));

            this._id = cookies.io;
            this.socket = new WebSocket(`${this.uri}/socket.io/?EIO=3&transport=websocket&sid=${this._id}`, {
                origin: this.origin
            });

            this.socket.on("open", () => {
                this.socket.send("2probe");

                res();
            });

            this.socket.on("close", () => {
                console.log("WebSocket connection closed.");
                this.stopPing();
            });

            this.socket.on("error", (error) => {
                console.error("WebSocket error:", error);
            });

            this.socket.on("message", (msg) => this.handleMessage(msg));
        });
    }

    isConnected() {
        return this.socket && this.socket.readyState === WebSocket.OPEN && this.connected;
    }

    startPing() {
        this.ping_interval = setInterval(() => {
            this.sendPing();
        }, 20000);

        return this;
    }

    stopPing() {
        clearInterval(this.ping_interval);

        return this;
    }

    sendPing() {
        this.socket.send("2");
        this.ping_sent = Date.now();
        console.log("[WS => CDP] Sent ping.");

        return this;
    }

    bindIntervals() {
        this.startPing().sendPing();
        this.mouse_buffer_interval = setInterval(() => {
            if (JSON.stringify(this.mouse) != this.last_mouse) {
                this.send("mouse-coords", this.mouse);
                this.last_mouse = JSON.stringify(this.mouse);
            }
        }, 100);

        return this;
    }

    send(_id, message) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            const msg = `42${JSON.stringify([_id, message])}`;
            this.socket.send(msg);
        }

        return this;
    }

    on(_id, handler) {
        this.handlers[_id] = handler;

        return this;
    }

    wait(ms) {
        return new Promise(res => {
            setTimeout(res, ms);
        });
    }

    setMousePos(x, y) {
        this.mouse.x = Math.clamp(0, x, 1);
        this.mouse.y = Math.clamp(0, y, 1);

        return this;
    }
    setMouseAngle(angle) {
        this.mouse.angle = angle;

        return this;
    }
    setMouseScale(scale) {
        this.mouse.scale = Math.clamp(0.05, scale, 10);

        return this;
    }
    setMouseCursor(type) {
        this.mouse.cursor = type;

        return this;
    }
    rotateMouse() {
        this.mouse.rotations++;

        return this;
    }
    setMouseData(data) {
        this.mouse = data;

        return this;
    }

    handleMessage(msg) {
        msg = msg.toString();

        switch (msg) {
            case "3probe":
                this.socket.send("5");
                this.connected = true;
                this.handleParsedMessage({
                    _id: "self-joined"
                });

                return this.bindIntervals();
            case "3":
                return console.log(`[CDP => WS] Pong! (${Date.now() - this.ping_sent}ms)`);
        }

        const message = this.parseSocketMessage(msg);
        if (message) {
            this.handleParsedMessage(message);
        }
    }

    parseSocketMessage(msg) {
        const match = msg.match(/^(\d+)(\[(.*)\])$/);
        if (match) {
            const id = match[1];
            const json = match[2];

            try {
                const parsed = JSON.parse(json);
                const name = parsed[0];
                const data = parsed[1];

                return {
                    _id: name,
                    data: data
                };
            } catch (error) {
                console.error("Failed to parse JSON:", error);
            }
        }
        return null;
    }

    handleParsedMessage(message) {
        const handler = this.handlers[message._id];
        if (handler) {
            handler(message.data); // Call the handler with the data
        }
    }
}

class User {
    constructor(_id) {
        this._id = _id;
        this.mouse = { x: 0, y: 0, angle: 0, cursor: 0, scale: 0.15, rotations: 0 };
    }

    setMouseData(data) {
        this.mouse = data;
    }

    toString() {
        return `User ID: ${this._id}, Mouse Position: (${this.mouseCoords.x}, ${this.mouseCoords.y})`;
    }
}


(async () => {
    const client = new CursorDancePartyHandler("wss://cursordanceparty.com", "https://cursordanceparty.com");
    await client.connect();

    console.log(`User ID: ${client._id}`);
    const users = new Map();

    function generateVertices() {
        let vertices = [];
        let coords = new Array(dimensions).fill(-1);
        function recurse(i) {
            if (i === dimensions) {
                vertices.push([...coords]);
                return;
            }
            coords[i] = -1;
            recurse(i + 1);
            coords[i] = 1;
            recurse(i + 1);
        };
        recurse(0);
        return vertices;
    }
    function generateEdges(vertices) {
        const edges = [];
        for (let i = 0; i < vertices.length; i++) {
            for (let j = i + 1; j < vertices.length; j++) {
                if (vertices[i].reduce((acc, val, k) => acc + Math.abs(val - vertices[j][k]), 0) === 2) {
                    edges.push([i, j]);
                }
            }
        }
        return edges;
    }
    function rotateAndProject(pos, angles) {
        let dimensions = pos.length;
        let new_pos = [...pos];

        for (let i = 0; i < dimensions; i++) {
            for (let j = i + 1; j < dimensions; j++) {
                const angle = angles[i][j] * Math.PI / 180;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const tempI = new_pos[i] * cos - new_pos[j] * sin;
                const tempJ = new_pos[i] * sin + new_pos[j] * cos;
                new_pos[i] = tempI;
                new_pos[j] = tempJ;
            }
        }

        return {
            x: new_pos[0] * size / 2 + center_pos.x,
            y: new_pos[1] * size + center_pos.y
        };
    }
    function waitTilReady(client) {
        return new Promise(res => {
            var check = setInterval(() => {
                let ok = true;
                for (let cl of client.clients) {
                    if (!cl.isConnected() || !users.get(cl._id)) {
                        ok = false;
                    }
                }
                if (ok) {
                    clearInterval(check);
                    return res();
                }
            }, 20);
        });
    }

    var center_pos = { x: 0.5, y: 0.5 };
    var center = null;
    var dimensions = 3;
    var resolution = 2;
    var size = 0.1;
    var speed = 1.5;

    client.on("self-joined", async (data) => {
        client.setMousePos(0.01, 0.02).setMouseCursor(CursorTypes.POINTER_BACK).rotateMouse();

        const vertices = generateVertices(dimensions);
        const edges = generateEdges(vertices);
        const edge_points = resolution - 2;
        const count = edges.length * edge_points + vertices.length;

        console.log(`Starting cursorbots animation...`);
        console.log(`Dimensions: \`${dimensions}D\` | Resolution: \`${resolution}/edge\` | Size: \`${size}\` | Speed: \`${speed}x\` | Total clients: \`${count}\``);

        for (let i = 0; i < count; i++) {
            let id = i + 1;
            await client.wait(0);

            let cl = new CursorDancePartyHandler(client.uri, client.origin);
            await cl.connect();

            client.clients.push(cl);
            cl.on("self-joined", async () => {
                const angles = Array.from({ length: dimensions }, () => Array(dimensions).fill(0));
                console.log(`Client ${id} joined!`);

                await waitTilReady(client);

                let pos;
                if (i < vertices.length) {
                    pos = vertices[i];
                } else {
                    const edge = Math.floor((i - vertices.length) / edge_points);
                    const t = ((i - vertices.length) % edge_points + 1) / (edge_points + 1);
                    const v0 = vertices[edges[edge][0]];
                    const v1 = vertices[edges[edge][1]];
                    pos = v0.map((v, idx) => v * (1 - t) + v1[idx] * t);
                }

                let spin = setInterval(() => {
                    if (!cl.isConnected()) {
                        return clearInterval(spin);
                    }
                    let { x, y } = rotateAndProject(pos, angles);
                    cl.setMousePos(x, y).setMouseScale(0.25).setMouseCursor(CursorTypes.WAIT)

                    for (let a = 0; a < dimensions; a++) {
                        for (let b = a + 1; b < dimensions; b++) {
                            angles[a][b] += speed;
                        }
                    }
                }, 100);
            });

            console.log(`Starting client ${id}`);
        }

        client.clients[0].on("mouse-coords", (data) => {
            if (data.id === center) {
                center_pos = { x: data.mouse.x, y: data.mouse.y };
            }
        });
    });

    client.on("partier-joined", (data) => {
        const user = new User(data.id);
        users.set(data.id, user);
    });

    client.on("partier-left", (data) => {
        if (users.has(data.id)) {
            users.delete(data.id);
        }
    });

    client.on("mouse-coords", (data) => {
        if (!users.has(data.id)) {
            const user = new User(data.id);
            users.set(data.id, user);
        }

        const user = users.get(data.id);
        user.setMouseData(data.mouse);
    });
})();