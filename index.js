const io = require("socket.io-client");
const config = require("./config.json");

// Utility function for clamping numbers
Math.clamp = (min, num, max) => {
    return Math.min(Math.max(num, min), max);
};
Math.rand = (min, max, floor = false) => {
    const rand = (Math.random() * (max - min)) + min;
    return floor ? Math.floor(rand) : rand;
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

class CursorDancePartyClient {
    constructor(uri) {
        this.uri = uri;
        this.socket = null;
        this.handlers = {};
        this.mouse = { x: 0, y: 0, angle: 0, cursor: 0, scale: 0.15, rotations: 0 };
        this.last_mouse = "";
        this.clients = [];
        this.users = new Map();

        this.socket = io(this.uri, {
            transports: ["websocket", "polling"],
            path: "/socket.io",
            autoConnect: false,
        });
        this.bindSocketEvents();
    }

    start() {
        return new Promise((resolve, reject) => {
            console.log(`[DEBUG] Attempting to connect to ${this.uri}`);
            this.socket.connect();

            this.socket.on("connect", () => {
                console.log(`[DEBUG] Connected. Socket ID: ${this.socket.id}`);
                this.socket.emit("self-joined");
                if (this.handlers["self-joined"]) {
                    setTimeout(() => {
                        this.handlers["self-joined"]({ id: this.socket.id, mouse: this.mouse });
                    }, 0);
                }
                resolve(this);
            });

            this.socket.on("connect_error", (error) => {
                console.error("[DEBUG] Connection error:", error);
                reject(error);
            });

            this.socket.on("error", (error) => {
                console.error("[DEBUG] Socket error:", error);
            });

            this.socket.on("disconnect", (reason) => {
                console.log(`[DEBUG] Disconnected. Reason: ${reason}`);
            });

            this.socket.on("reconnect_attempt", (attemptNumber) => {
                console.log(`[DEBUG] Reconnect attempt #${attemptNumber}`);
            });

            this.socket.on("reconnect", (attemptNumber) => {
                console.log(`[DEBUG] Reconnected on attempt #${attemptNumber}`);
            });

            this.socket.on("reconnect_failed", () => {
                console.log("[DEBUG] Reconnect failed");
            });
        });
    }

    // New stop method to cleanly disconnect.
    stop() {
        if (this.socket) {
            this.socket.disconnect();
        }
        return this;
    }

    isConnected() {
        return this.socket && this.socket.connected;
    }

    bindSocketEvents() {
        // Bind predefined events using the custom on() method.
        this.on("partier-joined", (data) => {
            console.log("[DEBUG] Partier joined:", data.id);
            const user = new User(data.id);
            this.users.set(data.id, user);
        });

        this.on("partier-left", (data) => {
            console.log("[DEBUG] Partier left:", data.id);
            if (this.users.has(data.id)) {
                this.users.delete(data.id);
            }
        });

        this.on("mouse-coords", (data) => {
            if (!this.users.has(data.id)) {
                const user = new User(data.id);
                this.users.set(data.id, user);
            }
            const user = this.users.get(data.id);
            user.setMouseData(data.mouse);
        });

        // Remove the duplicate binding loop since the "on" method already binds the handler:
        // Object.keys(this.handlers).forEach((event) => {
        //     this.socket.on(event, this.handlers[event]);
        // });

        this.bindIntervals();
        return this;
    }

    bindIntervals() {
        this.mouse_buffer_interval = setInterval(() => {
            if (JSON.stringify(this.mouse) !== this.last_mouse) {
                this.send("mouse-coords", this.mouse);
                this.last_mouse = JSON.stringify(this.mouse);
            }
        }, 20);
        return this;
    }

    send(event, message) {
        if (this.isConnected()) {
            this.socket.emit(event, message);
        }
        return this;
    }

    on(event, handler) {
        this.handlers[event] = handler;
        if (this.socket) {
            this.socket.on(event, handler);
        }
        return this;
    }

    wait(ms) {
        return new Promise((res) => setTimeout(res, ms));
    }

    setMousePos(x, y) {
        this.mouse.x = Math.clamp(0.001, x, 0.999);
        this.mouse.y = Math.clamp(0.001, y, 0.999);
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
        return `User ID: ${this._id}, Mouse Position: (${this.mouse.x}, ${this.mouse.y})`;
    }
}

// Helper functions.
function generateVertices(dimensions) {
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
    }
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

function rotateAndProject(pos, angles, size, center_pos) {
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
        y: new_pos[1] * size + center_pos.y,
    };
}

function waitTilReady(client) {
    return new Promise((res) => {
        let check = setInterval(() => {
            let ok = true;
            for (let cl of client.clients) {
                if (!cl.isConnected() || !users.has(cl.socket.id)) {
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

const client = new CursorDancePartyClient("https://cursordanceparty.com");
client.cursor_animation = {};

client.on("self-joined", async (data) => {
    client.setMousePos(0.01, 0.02).setMouseScale(0.25).setMouseCursor(CursorTypes.WAIT);

    const start_t = Date.now();
    let velocities = {};
    const velocity = 0.003;
    client.cursor_animation = {
        type: process.argv[2],
        timeouts: {},
        velocity: velocity,
        bound_x: 1,
        bound_y: 1,
        velocity_x: velocity / 2, // the width is 2x longer than the height
        velocity_y: velocity,
        x: client.cursor_animation.x ?? 0.5,
        y: client.cursor_animation.y ?? 0.5,
        center_x: 0.5,
        center_y: 0.5,
        angle: 0,
    };

    setInterval(async () => {
        const now = performance.now();
        const dt = (now - (client.last_frame || now)) / 1000; // Delta time in seconds
        client.last_frame = now;

        if (client.following && client.mouse) {
            if (client.mouse.x !== client.following.mouse.x || client.mouse.y !== client.following.mouse.y) {
                client.cursor_animation.x = Number(client.following.mouse.x);
                client.cursor_animation.y = Number(client.following.mouse.y);

                client.setMousePos(client.following.mouse.x, client.following.mouse.y);
            }
        }

        for (let [_id, user] of client.users.entries()) {
            const distance_factor = 1.5;
            if (!velocities[user._id]) {
                velocities[user._id] = { last_x: user.mouse.x, last_y: user.mouse.y };
            }

            let distance = Math.sqrt((user.mouse.x - velocities[user._id].last_x) ** 2 + (user.mouse.y - velocities[user._id].last_y) ** 2);
            let factor = distance ? distance_factor / distance : 0;

            velocities[user._id].velocity_x = (user.mouse.x - velocities[user._id].last_x) * factor;
            velocities[user._id].velocity_y = (user.mouse.y - velocities[user._id].last_y) * factor;
            velocities[user._id].last_x = user.mouse.x;
            velocities[user._id].last_y = user.mouse.y;
        }

        if (client.cursor_animation && client.mouse) {
            let anim = client.cursor_animation;
            switch (anim.type) {
                case "dvd": {
                    if (anim.x >= anim.bound_x || anim.x <= 0) anim.velocity_x *= -1;
                    if (anim.y >= anim.bound_y || anim.y <= 0) anim.velocity_y *= -1;
                    anim.x += anim.velocity_x * dt * 64;
                    anim.y += anim.velocity_y * dt * 64;
                    break;
                }
                case "circle": {
                    const radius = 0.15;
                    anim.angle += dt * 2;
                    anim.x = anim.center_x + Math.cos(anim.angle) * (radius / 2);
                    anim.y = anim.center_y + Math.sin(anim.angle) * radius;
                    break;
                }
                case "infinity": {
                    const radius = 0.15;
                    anim.angle += dt * 2;
                    anim.x = anim.center_x + Math.cos(anim.angle) * radius;
                    anim.y = anim.center_y + Math.sin(anim.angle * 2) * radius;
                    break;
                }
                case "spiral": {
                    let radius = Math.sin(anim.angle / 4) * 0.3 + 0.2;
                    anim.angle += dt;
                    anim.x = anim.center_x + Math.cos(anim.angle) * (radius / 2);
                    anim.y = anim.center_y + Math.sin(anim.angle) * radius;
                    break;
                }
                case "sine": {
                    if (anim.x >= anim.bound_x || anim.x <= 0) {
                        anim.velocity_x *= -1;
                    }
                    // Multiply by dt to keep the movement consistent regardless of frame rate.
                    anim.x += anim.velocity_x * dt * 64;
                    anim.y += anim.velocity_y * Math.cos(anim.angle) * dt * 64;
                    anim.angle += dt;
                    break;
                }
                case "leaf": {
                    let offset = 0.1;
                    // Scale both X and Y updates by dt.
                    let newX = anim.x + Math.cos(anim.angle) * dt / 16;
                    let newY = anim.y + anim.velocity_y * dt * 8;
                    if (anim.y >= anim.bound_y) {
                        newY = 0;
                        newX = Math.rand(offset, anim.bound_x - offset);
                    }
                    anim.x = newX;
                    anim.y = newY;
                    anim.angle += dt;
                    break;
                }
                case "pong": {
                    let radius = 0.1;
                    let timeout = 1000;
                    if (anim.x >= anim.bound_x || anim.x < 0) {
                        anim.velocity_x *= -1;
                    }
                    if (anim.y >= anim.bound_y || anim.y < 0) {
                        anim.velocity_y *= -1;
                    }
                    for (let [_id, user] of client.users.entries()) {
                        if (user._id == client._id) continue;
                        let dx = user.mouse.x - anim.x;
                        let dy = user.mouse.y - anim.y;
                        let distance = Math.sqrt(dx * dx + dy * dy);
                        if (distance <= radius * user.mouse.scale && !anim.timeouts[user._id]) {
                            let normalX = dx / distance;
                            let normalY = dy / distance;
                            let dot = anim.velocity_x * normalX + anim.velocity_y * normalY;
                            anim.velocity_x -= 2 * dot * normalX;
                            anim.velocity_y -= 2 * dot * normalY;
                            anim.timeouts[user._id] = true;
                            await client.wait(timeout);
                            if (anim) {
                                anim.timeouts[user._id] = false;
                            }
                        }
                    }
                    anim.x += anim.velocity_x * dt * 64;
                    anim.y += anim.velocity_y * dt * 64;
                    break;
                }
                case "bounce": {
                    let g = 0.25;
                    let initialY = anim.y;
                    let initialVelY = anim.velocity_y;
                    let newY = initialY + initialVelY * dt + 0.5 * g * dt * dt;
                    let newVelY = initialVelY + g * dt;

                    if (newY >= anim.bound_y) {
                        newVelY = -Math.rand(g, g * 3);
                    }
                    if (newY <= 0) {
                        newVelY *= -0.5;
                        newY = 0;
                    }
                    if (anim.x >= anim.bound_x || anim.x < 0) {
                        anim.velocity_x *= -1;
                    }

                    anim.x += anim.velocity_x * dt * 64;
                    anim.y = newY;
                    anim.velocity_y = newVelY;

                    let radius = 0.1;
                    let bounciniess = 1.05;
                    let timeout = 1000;

                    for (let [_id, user] of client.users.entries()) {
                        if (user._id === client._id) continue;

                        let dx = user.mouse.x - anim.x;
                        let dy = user.mouse.y - anim.y;
                        let distance = Math.sqrt(dx * dx + dy * dy);

                        if (distance <= radius * user.mouse.scale && !anim.timeouts[user._id]) {
                            anim.velocity_y = -Math.abs(anim.velocity_y) * bounciniess;

                            anim.timeouts[user._id] = true;
                            await client.wait(timeout);
                            if (anim) {
                                anim.timeouts[user._id] = false;
                            }
                        }
                    }
                    break;
                }
                case "hockey": {
                    let radius = 0.1;
                    let dampening = 0.99;
                    let timeout = 1000;
                    for (let [_id, user] of client.users.entries()) {
                        if (user._id == client._id) continue;
                        if (!velocities[user._id].velocity_x || !velocities[user._id].velocity_y) continue;
                        let dx = user.mouse.x - anim.x;
                        let dy = user.mouse.y - anim.y;
                        let distance = Math.sqrt(dx * dx + dy * dy);
                        if (distance <= radius * user.mouse.scale && !anim.timeouts[user._id]) {
                            let normalX = dx / distance;
                            let normalY = dy / distance;
                            let relativeVelocityX = anim.velocity_x - velocities[user._id].velocity_x / 512;
                            let relativeVelocityY = anim.velocity_y - velocities[user._id].velocity_y / 512;
                            let dotProduct = relativeVelocityX * normalX + relativeVelocityY * normalY;
                            anim.velocity_x -= 2 * dotProduct * normalX;
                            anim.velocity_y -= 2 * dotProduct * normalY;
                            anim.timeouts[user._id] = true;
                            await client.wait(timeout);
                            if (anim) {
                                anim.timeouts[user._id] = false;
                            }
                        }
                    }
                    anim.x += anim.velocity_x * dt * 64;
                    anim.y += anim.velocity_y * dt * 64;
                    anim.velocity_x *= dampening;
                    anim.velocity_y *= dampening;
                    if (anim.x >= anim.bound_x || anim.x < 0) {
                        anim.velocity_x *= -dampening;
                    }
                    if (anim.y >= anim.bound_y || anim.y < 0) {
                        anim.velocity_y *= -dampening;
                    }
                    anim.x = Math.clamp(0, anim.x, anim.bound_x);
                    anim.y = Math.clamp(0, anim.y, anim.bound_y);
                    break;
                }
            }

            client.setMousePos(anim.x, anim.y);
        }
    }, 1000 / config.fps.cursor_animation);
});

client.start();