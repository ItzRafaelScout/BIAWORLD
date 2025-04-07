const log = require("./log.js").log;
const Ban = require("./ban.js");
const Utils = require("./utils.js");
const io = require('./index.js').io;
const settings = require("./settings.json");
const sanitize = require('sanitize-html');

let roomsPublic = [];
let rooms = {};
let usersAll = [];

// Add reconnection settings
const reconnectSettings = {
    enabled: true,
    maxAttempts: 5,
    timeout: 5000  // 5 seconds between reconnection attempts
};

// Export reconnection settings so they can be accessed from the client
exports.reconnectSettings = reconnectSettings;

// Add middleware to handle reconnection
exports.setupReconnect = function() {
    io.use((socket, next) => {
        // Set reconnection options
        socket.conn.on('close', (reason) => {
            if (reconnectSettings.enabled && socket.recovered !== false) {
                log.info.log('debug', 'attemptingReconnect', {
                    id: socket.id,
                    reason: reason
                });
            }
        });
        next();
    });
};

// Update the main init function to include reconnection setup
exports.init = function() {
    exports.beat();
    exports.setupReconnect();
};

exports.beat = function() {
    io.on('connection', function(socket) {
        new User(socket);
    });
};

function checkRoomEmpty(room) {
    if (room.users.length != 0) return;

    log.info.log('debug', 'removeRoom', {
        room: room
    });

    let publicIndex = roomsPublic.indexOf(room.rid);
    if (publicIndex != -1)
        roomsPublic.splice(publicIndex, 1);
    
    room.deconstruct();
    delete rooms[room.rid];
    delete room;
}

class Room {
    constructor(rid, prefs) {
        this.rid = rid;
        this.prefs = prefs;
        this.users = [];
    }

    deconstruct() {
        try {
            this.users.forEach((user) => {
                user.disconnect();
            });
        } catch (e) {
            log.info.log('warn', 'roomDeconstruct', {
                e: e,
                thisCtx: this
            });
        }
        //delete this.rid;
        //delete this.prefs;
        //delete this.users;
    }

    isFull() {
        return this.users.length >= this.prefs.room_max;
    }

    join(user) {
        user.socket.join(this.rid);
        this.users.push(user);

        this.updateUser(user);
    }

    leave(user) {
        // HACK
        try {
            this.emit('leave', {
                 guid: user.guid
            });
     
            let userIndex = this.users.indexOf(user);
     
            if (userIndex == -1) return;
            this.users.splice(userIndex, 1);
     
            checkRoomEmpty(this);
        } catch(e) {
            log.info.log('warn', 'roomLeave', {
                e: e,
                thisCtx: this
            });
        }
    }

    updateUser(user) {
		this.emit('update', {
			guid: user.guid,
			userPublic: user.public
        });
    }

    getUsersPublic() {
        let usersPublic = {};
        this.users.forEach((user) => {
            usersPublic[user.guid] = user.public;
        });
        return usersPublic;
    }

    emit(cmd, data) {
		io.to(this.rid).emit(cmd, data);
    }
}

function newRoom(rid, prefs) {
    rooms[rid] = new Room(rid, prefs);
    log.info.log('debug', 'newRoom', {
        rid: rid
    });
}

let userCommands = {
    "godmode": function(word) {
        let success = word == this.room.prefs.godword;
        if (success) this.private.runlevel = 3;
        log.info.log('debug', 'godmode', {
            guid: this.guid,
            success: success
        });
    },
    "sanitize": function() {
        let sanitizeTerms = ["false", "off", "disable", "disabled", "f", "no", "n"];
        let argsString = Utils.argsString(arguments);
        this.private.sanitize = !sanitizeTerms.includes(argsString.toLowerCase());
    },
    "joke": function() {
        this.room.emit("joke", {
            guid: this.guid,
            rng: Math.random()
        });
    },
    "fact": function() {
        this.room.emit("fact", {
            guid: this.guid,
            rng: Math.random()
        });
    },
    "youtube": function(vidRaw) {
        var vid = this.private.sanitize ? sanitize(vidRaw) : vidRaw;
        this.room.emit("youtube", {
            guid: this.guid,
            vid: vid
        });
    },
    "image": function(vidRaw){
        var vid = this.private.sanitize ? sanitize(vidRaw) : vidRaw;
        this.room.emit("image", {
            guid: this.guid,
            vid: vid
        });
    },
    "video": function(vidRaw){
        var vid = this.private.sanitize ? sanitize(vidRaw) : vidRaw;
        this.room.emit("video", {
            guid: this.guid,
            vid: vid
        });
    },
    "backflip": function(swag) {
        this.room.emit("backflip", {
            guid: this.guid,
            swag: swag == "swag"
        });
    },
    "linux": "passthrough",
    "pawn": "passthrough",
    "bees": "passthrough",
    "color": function(color) {
        if (typeof color != "undefined") {
            if (settings.bonziColors.indexOf(color) == -1)
                return;
            
            this.public.color = color;
        } else {
            let bc = settings.bonziColors;
            this.public.color = bc[
                Math.floor(Math.random() * bc.length)
            ];
        }

        this.room.updateUser(this);
    },
    "pope": function() {
        this.public.color = "pope";
        this.room.updateUser(this);
    },
    "asshole": function() {
        this.room.emit("asshole", {
            guid: this.guid,
            target: sanitize(Utils.argsString(arguments))
        });
    },
    "owo": function() {
        this.room.emit("owo", {
            guid: this.guid,
            target: sanitize(Utils.argsString(arguments))
        });
    },
    "triggered": "passthrough",
    "vaporwave": function() {
        this.socket.emit("vaporwave");
        this.room.emit("youtube", {
            guid: this.guid,
            vid: "_4gl-FX2RvI"
        });
    },
    "unvaporwave": function() {
        this.socket.emit("unvaporwave");
    },
    "name": function() {
        let argsString = Utils.argsString(arguments);
        if (argsString.length > this.room.prefs.name_limit)
            return;

        let name = argsString || this.room.prefs.defaultName;
        this.public.name = this.private.sanitize ? sanitize(name) : name;
        this.room.updateUser(this);
    },
    "pitch": function(pitch) {
        pitch = parseInt(pitch);

        if (isNaN(pitch)) return;

        this.public.pitch = Math.max(
            Math.min(
                parseInt(pitch),
                this.room.prefs.pitch.max
            ),
            this.room.prefs.pitch.min
        );

        this.room.updateUser(this);
    },
    "speed": function(speed) {
        speed = parseInt(speed);

        if (isNaN(speed)) return;

        this.public.speed = Math.max(
            Math.min(
                parseInt(speed),
                this.room.prefs.speed.max
            ),
            this.room.prefs.speed.min
        );
        
        this.room.updateUser(this);
    },
    "kick": function(username) {
        // Only allow popes to use kick command
        if (this.public.color !== "pope") return;
        
        if (!username) return;
        
        let found = false;
        this.room.users.forEach((user) => {
            if (user.public.name.toLowerCase() === username.toLowerCase()) {
                found = true;
                let ip = user.getIp();
                Ban.kick(ip, "Kicked by " + this.public.name);
                this.room.emit("alert", {
                    text: username + " has been kicked by " + this.public.name
                });
            }
        });
        
        if (!found) {
            this.socket.emit("alert", {
                text: "Could not find user: " + username
            });
        }
    },
    "ban": function(ip, username, reason, length) {
        // Only allow popes to use ban command
        if (this.public.color !== "pope") return;
        
        if (!ip || !username) return;
        
        // Default values
        reason = reason || "No reason provided";
        length = length || settings.banLength;
        
        // Handle time periods
        if (typeof length === "string") {
            let match;
            // Extract number and unit (h=hours, d=days, w=weeks, perm=permanent)
            if (length === "perm") {
                length = 525600; // 1 year in minutes (effectively permanent)
            } else if ((match = length.match(/^(\d+)h$/))) {
                length = parseInt(match[1]) * 60; // Convert hours to minutes
            } else if ((match = length.match(/^(\d+)d$/))) {
                length = parseInt(match[1]) * 1440; // Convert days to minutes
            } else if ((match = length.match(/^(\d+)w$/))) {
                length = parseInt(match[1]) * 10080; // Convert weeks to minutes
            } else {
                length = settings.banLength; // Default ban length
            }
        }
        
        // Try to find user by name if no direct IP
        let targetIp = ip;
        let found = false;
        
        if (ip === "auto") {
            this.room.users.forEach((user) => {
                if (user.public.name.toLowerCase() === username.toLowerCase()) {
                    found = true;
                    targetIp = user.getIp();
                }
            });
            
            if (!found) {
                this.socket.emit("alert", {
                    text: "Could not find user: " + username
                });
                return;
            }
        }
        
        Ban.addBan(targetIp, length, reason);
        
        this.room.emit("alert", {
            text: username + " has been banned by " + this.public.name + " for: " + reason
        });
    },
    "showip": function(username) {
        // Only allow popes to use this command
        if (this.public.color !== "pope") return;
        
        if (!username) return;
        
        let found = false;
        this.room.users.forEach((user) => {
            if (user.public.name.toLowerCase() === username.toLowerCase()) {
                found = true;
                const ip = user.getIp();
                this.socket.emit("alert", {
                    text: username + "'s IP: " + ip + " | Location: " + user.public.location
                });
            }
        });
        
        if (!found) {
            this.socket.emit("alert", {
                text: "Could not find user: " + username
            });
        }
    }
};


class User {
    constructor(socket) {
        this.guid = Utils.guidGen();
        this.socket = socket;

        // Handle ban
	    if (Ban.isBanned(this.getIp())) {
            Ban.handleBan(this.socket);
        }

        this.private = {
            login: false,
            sanitize: true,
            runlevel: 0
        };

        this.public = {
            color: settings.bonziColors[Math.floor(
                Math.random() * settings.bonziColors.length
            )],
            location: "Unknown" // Default location
        };

        // Get IP and attempt to determine country
        const ip = this.getIp();
        
        // We'll call this asynchronously to not block login
        // In a real implementation, you would use a proper IP geolocation service
        // For this example, we'll just set a placeholder
        this.public.location = "🌐 Unknown";
        
        // Set a fake country emoji for demo purposes (this would be replaced with actual geolocation)
        const randomFlags = ["🇺🇸", "🇬🇧", "🇨🇦", "🇦🇺", "🇯🇵", "🇩🇪", "🇫🇷", "🇮🇳", "🇧🇷", "🇲🇽"];
        this.public.location = randomFlags[Math.floor(Math.random() * randomFlags.length)] + " " + ip;

        log.access.log('info', 'connect', {
            guid: this.guid,
            ip: this.getIp()
        });

        // Setup reconnection events
        this.socket.on('reconnect_attempt', () => {
            log.access.log('info', 'reconnect_attempt', {
                guid: this.guid,
                ip: this.getIp()
            });
        });

        this.socket.on('reconnect', () => {
            log.access.log('info', 'reconnect_success', {
                guid: this.guid,
                ip: this.getIp()
            });
            // If user was logged in before, try to put them back in their room
            if (this.private && this.private.login && this.room) {
                this.room.join(this);
                this.socket.emit('updateAll', {
                    usersPublic: this.room.getUsersPublic()
                });
            }
        });

        this.socket.on('reconnect_error', (error) => {
            log.access.log('info', 'reconnect_error', {
                guid: this.guid,
                ip: this.getIp(),
                error: error.message
            });
        });

        this.socket.on('reconnect_failed', () => {
            log.access.log('info', 'reconnect_failed', {
                guid: this.guid,
                ip: this.getIp()
            });
        });

        this.socket.on('login', this.login.bind(this));
    }

    getIp() {
        return this.socket.request.connection.remoteAddress;
    }

    getPort() {
        return this.socket.handshake.address.port;
    }

    login(data) {
        if (typeof data != 'object') return; // Crash fix (issue #9)
        
        if (this.private.login) return;

		log.info.log('info', 'login', {
			guid: this.guid,
        });
        
        let rid = data.room;
        
		// Check if room was explicitly specified
		var roomSpecified = true;

		// If not, set room to public
		if ((typeof rid == "undefined") || (rid === "")) {
			rid = roomsPublic[Math.max(roomsPublic.length - 1, 0)];
			roomSpecified = false;
		}
		log.info.log('debug', 'roomSpecified', {
			guid: this.guid,
			roomSpecified: roomSpecified
        });
        
		// If private room
		if (roomSpecified) {
            if (sanitize(rid) != rid) {
                this.socket.emit("loginFail", {
                    reason: "nameMal"
                });
                return;
            }

			// If room does not yet exist
			if (typeof rooms[rid] == "undefined") {
				// Clone default settings
				var tmpPrefs = JSON.parse(JSON.stringify(settings.prefs.private));
				// Set owner
				tmpPrefs.owner = this.guid;
                newRoom(rid, tmpPrefs);
			}
			// If room is full, fail login
			else if (rooms[rid].isFull()) {
				log.info.log('debug', 'loginFail', {
					guid: this.guid,
					reason: "full"
				});
				return this.socket.emit("loginFail", {
					reason: "full"
				});
			}
		// If public room
		} else {
			// If room does not exist or is full, create new room
			if ((typeof rooms[rid] == "undefined") || rooms[rid].isFull()) {
				rid = Utils.guidGen();
				roomsPublic.push(rid);
				// Create room
				newRoom(rid, settings.prefs.public);
			}
        }
        
        this.room = rooms[rid];

        // Check name
		this.public.name = sanitize(data.name) || this.room.prefs.defaultName;

		if (this.public.name.length > this.room.prefs.name_limit)
			return this.socket.emit("loginFail", {
				reason: "nameLength"
			});
        
		if (this.room.prefs.speed.default == "random")
			this.public.speed = Utils.randomRangeInt(
				this.room.prefs.speed.min,
				this.room.prefs.speed.max
			);
		else this.public.speed = this.room.prefs.speed.default;

		if (this.room.prefs.pitch.default == "random")
			this.public.pitch = Utils.randomRangeInt(
				this.room.prefs.pitch.min,
				this.room.prefs.pitch.max
			);
		else this.public.pitch = this.room.prefs.pitch.default;

        // Join room
        this.room.join(this);

        this.private.login = true;
        this.socket.removeAllListeners("login");

		// Send all user info
		this.socket.emit('updateAll', {
			usersPublic: this.room.getUsersPublic()
		});

		// Send room info
		this.socket.emit('room', {
			room: rid,
			isOwner: this.room.prefs.owner == this.guid,
			isPublic: roomsPublic.indexOf(rid) != -1
		});

        this.socket.on('talk', this.talk.bind(this));
        this.socket.on('command', this.command.bind(this));
        this.socket.on('disconnect', this.disconnect.bind(this));
    }

    talk(data) {
        if (typeof data != 'object') { // Crash fix (issue #9)
            data = {
                text: "HEY EVERYONE LOOK AT ME I'M TRYING TO SCREW WITH THE SERVER LMAO"
            };
        }

        log.info.log('debug', 'talk', {
            guid: this.guid,
            text: data.text
        });

        if (typeof data.text == "undefined")
            return;

        let text = this.private.sanitize ? sanitize(data.text) : data.text;
        if ((text.length <= this.room.prefs.char_limit) && (text.length > 0)) {
            this.room.emit('talk', {
                guid: this.guid,
                text: text
            });
        }
    }

    command(data) {
        if (typeof data != 'object') return; // Crash fix (issue #9)

        var command;
        var args;
        
        try {
            var list = data.list;
            command = list[0].toLowerCase();
            args = list.slice(1);
    
            log.info.log('debug', command, {
                guid: this.guid,
                args: args
            });

            if (this.private.runlevel >= (this.room.prefs.runlevel[command] || 0)) {
                let commandFunc = userCommands[command];
                if (commandFunc == "passthrough")
                    this.room.emit(command, {
                        "guid": this.guid
                    });
                else commandFunc.apply(this, args);
            } else
                this.socket.emit('commandFail', {
                    reason: "runlevel"
                });
        } catch(e) {
            log.info.log('debug', 'commandFail', {
                guid: this.guid,
                command: command,
                args: args,
                reason: "unknown",
                exception: e
            });
            this.socket.emit('commandFail', {
                reason: "unknown"
            });
        }
    }

    disconnect() {
		let ip = "N/A";
		let port = "N/A";

		try {
			ip = this.getIp();
			port = this.getPort();
		} catch(e) { 
			log.info.log('warn', "exception", {
				guid: this.guid,
				exception: e
			});
		}

		log.access.log('info', 'disconnect', {
			guid: this.guid,
			ip: ip,
			port: port
		});
         
        this.socket.broadcast.emit('leave', {
            guid: this.guid
        });
        
        // Store the room and login state for reconnection
        if (reconnectSettings.enabled) {
            this.socket._lastRoom = this.room ? this.room.rid : null;
            this.socket._wasLoggedIn = this.private.login;
        }
        
        this.socket.removeAllListeners('talk');
        this.socket.removeAllListeners('command');
        this.socket.removeAllListeners('disconnect');

        this.room.leave(this);

        // Set reconnection options on the socket
        if (reconnectSettings.enabled) {
            this.socket.conn.on('upgrade', () => {
                log.access.log('info', 'connection_upgrade', {
                    guid: this.guid,
                    ip: ip
                });
            });
        }
    }
}
