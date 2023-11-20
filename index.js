import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { join, parse } from 'node:path';
import { lookup } from 'mime-types';
import { WebSocketServer } from 'ws';

const worldWidth = 20;
const worldHeight = 20;
const apples = new Set();

const users = new Map();
const sendTo = (user, data) => {
	user.send(JSON.stringify(data));
};
const sendToAll = (data) => {
	for (const { socket } of users.values()) {
		sendTo(socket, data);
	}
};
new WebSocketServer({
	server: createServer((request, response) => {
		createReadStream(join('./public', request.url))
			.on('open', function() {
				response.setHeader('Content-Type', lookup(parse(request.url).ext));
				this.pipe(response);
			})
			.on('error', () => response.writeHead(404).end());
	}).listen(8080)
}).on('connection', (socket) => {
	const id = randomUUID();
	const player = {
		direction: {
			x: 0,
			y: 0
		},
		body: [
			{
				x: Math.floor(Math.random() * worldWidth),
				y: Math.floor(Math.random() * worldHeight)
			}
		],
		head: {}
	};
	users.set(id, { socket, player });
	if (apples.size < users.size) {
		apples.add({
			x: Math.floor(Math.random() * worldWidth),
			y: Math.floor(Math.random() * worldHeight)
		});
	}

	socket.on('close', () => {
		users.delete(id);
	}).on('message', (buffer) => {
		try {
			const message = JSON.parse(buffer.toString());
			if ((!!message.x != !!message.y) && ((!!player.direction.x != !!message.x) || (!!player.direction.y != !!message.y))) {
				player.direction = message;
			}
		} catch {}
	});
});

const updatesPerSecond = 10;
setInterval(() => {
	for (const { player } of users.values()) {
		player.head = {
			x: (player.body[0].x + player.direction.x + worldWidth) % worldWidth,
			y: (player.body[0].y + player.direction.y + worldHeight) % worldHeight
		};
		let eating = false;
		for (const apple of apples) {
			if ((player.head.x == apple.x) && (player.head.y == apple.y)) {
				apples.delete(apple);
				if (apples.size < users.size) {
					apples.add({
						x: Math.floor(Math.random() * worldWidth),
						y: Math.floor(Math.random() * worldHeight)
					});
				}
				eating = true;
			}
		}
		if (!eating) {
			player.body.pop();
		}
	}
	const world = [...Array(worldWidth)].map(() => [...Array(worldHeight)].fill(false));
	for (const { player } of users.values()) {
		for (const { x, y } of player.body) {
			world[x][y] = true;
		}
	}
	for (const { player, socket } of users.values()) {
		if (world[player.head.x][player.head.y]) {
			socket.close();
			continue;
		}
		player.body.unshift(player.head);
	}
	sendToAll({
		players: [...users.values()].map(({ player }) => player.body),
		apples: [...apples]
	});
}, 1000 / updatesPerSecond);
