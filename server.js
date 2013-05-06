#!/usr/bin/env node
var WebSocketServer = require('websocket').server;
var http = require('http');

var server = http.createServer(function(request, response) {
    console.log((new Date()) + ' Received request for ' + request.url);
    response.writeHead(404);
    response.end();
});
server.listen(8888, function() {
    console.log((new Date()) + ' Server is listening on port 8888');
});

wsServer = new WebSocketServer({
    httpServer: server,
    // You should not use autoAcceptConnections for production
    // applications, as it defeats all standard cross-origin protection
    // facilities built into the protocol and the browser.  You should
    // *always* verify the connection's origin and decide whether or not
    // to accept it.
    autoAcceptConnections: false
});

function originIsAllowed(origin) {
  // put logic here to detect whether the specified origin is allowed.
  return true;
}

/* ------------ match.js ------------ */

// give each match a unique id number
var gMatchId = 0;

// matches waiting for players to join
var idle_matches = {}

// active matches active
var active_matches = {}

// default match timeout value in ms
var min_timeout = 60 * 1000;

// all clients not in a match
var idle_connections = {}

// all clients in a match
var active_connections = {}

// number of matches to keep opening with 1 minute
var num_idle_matches = 10;

// unique identifiers for all connected players
var nicks = {}

// reduce the match timeout by this value in each iteration of the idle loop
var updateInterval = 1000;

// create a new match starting in timeout milliseconds
function Match(timeout) {
    this.timeout = timeout;
    this.players = [];
    this.id = gMatchId++;
    this.remainingNumbers = range(1, 76);
    this.calledNumbers = [];
    this.jackpot = 5;
}

Match.prototype.addPlayer = function(player) {
    this.players.push(player);
    this.jackpot += 5;
    player.match = this;
}

Match.prototype.removePlayer = function(player) {
    var index = this.players.indexOf(player);
    if (index == -1) {
        return;
    }
    this.players.splice(index, 1);
    this.jackpot -= 5;
    player.match = null;
}

// when timeout reaches 0, move match into the active queue
// it will no longer accept new players
// if there are no players connected to the match, recycle it
Match.prototype.updateIdle = function(updateInterval) {
    this.timeout -= updateInterval;
    if (this.timeout <= 0) {
        delete idle_matches[this.id];
        if (this.players.length > 0) {
            active_matches[this.id] = this;
            console.log("Match " + this.id + " is now active");
        }
        else {
            console.log("Match " + this.id + " has no players and will not be activated");
        }

        var new_idle = new Match(num_idle_matches * min_timeout);
        idle_matches[new_idle.id] = new_idle;
        console.log("Created new idle match " + new_idle.id);
    }

    // notify connected players about the status of this match
    var statusMessage = JSON.stringify({status: {timeout: this.timeout}})
    this.players.forEach(function(player) {
        player.connection.sendUTF(statusMessage);
    });
}

Match.prototype.updateActive = function(updateInterval) {
    if (this.players.length === 0) {
        console.log("Match " + this.id + " has no players and will be recycled");

        delete active_matches[this.id];

        // We should create a new idle match to replace this one
        // But that causes us to have too many idle matches
        // var new_idle = new Match(num_idle_matches * min_timeout);
        // idle_matches[new_idle.id] = new_idle;
        // console.log("Created new idle match " + new_idle.id);
    }

    // did we run out of numbers? Shouldn't happen
    if (this.remainingNumbers.length == 0) {
        console.log("Match " + this.id + " is out of bingo numbers and will be recycled");

        delete active_matches[this.id];
        this.players.forEach(function(player) {
            player.reset();
        });
    }

    // select a random value from the remaining numbers we have
    var callValue = rselect(this.remainingNumbers, 1).shift();
    this.calledNumbers.push(callValue);
    var statusMessage = JSON.stringify({status: {call: callValue}})
    this.players.forEach(function(player) {
        player.connection.sendUTF(statusMessage);
    });
}

Match.prototype.isIdle = function() {
    return idle_matches[this.id] === this;
}

// create the initial idle matches with 1 minute intervals separating their start times
function createInitialMatches() {
    for (var i = 1; i <= num_idle_matches; i++) {
        var timeout = i * min_timeout;
        var match = new Match(timeout);
        idle_matches[match.id] = match;
    }
}

function idleMatches() {
    return JSON.stringify({idle_matches: Object.keys(idle_matches).map(function(id) {
        var match = idle_matches[id];
        return {
            id : id,
            timeout : match.timeout,
            num_players : match.players.length,
            jackpot : match.jackpot};
    })});
}

// notify idle clients once a second of the status of available games
function idleClientLoop() {
    var idleMessage = idleMatches();

    for (var conn in idle_connections) {
        idle_connections[conn].connection.sendUTF(idleMessage);
    }
    setTimeout(idleClientLoop, updateInterval);
}

// update matches once a second
function matchUpdateLoop() {

    console.log(new Date() + ' There are ' + Object.keys(idle_matches).length + ' idle matches');
    for (var match in idle_matches) {
        idle_matches[match].updateIdle(updateInterval);
    }

    console.log(new Date() + ' There are ' + Object.keys(active_matches).length + ' active matches');
    for (var match in active_matches) {
        active_matches[match].updateActive(updateInterval);
    }

    setTimeout(matchUpdateLoop, updateInterval);
}

createInitialMatches();
console.log(' Created initial matches: ' + idleMatches());

idleClientLoop();
matchUpdateLoop();

/* ------------ end match.js ------------ */


/* ------------ player.js ------------ */

var gGuestId = 0;

function Player(connection) {
    this.connection = connection;
    this.id = connection.socket._handle.fd;
    this.nick = 'guest' + ++gGuestId;
    this.cards = [];
    this.winnings = 0.0;
}

Player.prototype.matchId = function() {
    if (this.match) {
        return this.match.id;
    }
    return null;
}

// to be called when a player finishes a match
Player.prototype.reset = function() {
    this.cards = [];
    this.match = null;
    delete active_connections[this.id];
    idle_connections[this.id] = this;
}

function compareArray(arr1, arr2) {
    if (arr1.length !== arr2.length) {
        return false;
    }

    var sorted1 = arr1.sort();
    var sorted2 = arr2.sort();

    return sorted1.toString() == sorted2.toString();
}

Player.prototype.validate_bingo = function(cardData) {
    // first check if the card is actually one of the player's cards
    this.cards.forEach(function(card) {
        for (var colIndex in card.cells) {
            if (!compareArray(card.cells[colIndex], cardData.cells[colIndex])) {
                return false;
            }
        }
    });

    // then confirm that it is actually a bingo
    return new Card(cardData.cells).hasBingo();
}

Player.prototype.notifyPeers = function(message) {
    if (!this.match)
        return;

    this.match.players.forEach(function(peer) {
        if ((peer !== this) && (peer.connection)) {
            peer.connection.sendUTF(message);
        }
    });
}

/* ------------ end player.js ------------ */


/* ------------ card.js ------------ */

function range(start, stop, step) {
    if (typeof stop=='undefined') {
        // one param defined
        stop = start;
        start = 0;
    };
    if (typeof step=='undefined') {
        step = 1;
    };
    if ((step>0 && start>=stop) || (step<0 && start<=stop)) {
        return [];
    };
    var result = [];
    for (var i=start; step>0 ? i<stop : i>stop; i+=step) {
        result.push(i);
    };
    return result;
};

// randomly select n items from the list with removal
function rselect(list, n) {
    var result = [];
    for (var i=0; i < n; i++) {
        var index = Math.floor(Math.random() * list.length);
        result.push(list.splice(index, 1).shift(1));
    }
    return result;
}

function randomCardData() {
    var b = rselect(range(1, 16), 5);
    var i = rselect(range(16, 31), 5);
    var n = rselect(range(31, 46), 4);      // centre of card is a free square
    var g = rselect(range(46, 61), 5);
    var o = rselect(range(61, 76), 5);

    return {b : b, i : i, n : n, g : g, o : o};
}

function Card(cardData) {
    this.calledNumbers = [];
    this.cells = cardData || randomCardData();
    console.log(this.cells);
}

Card.prototype.setPlayer = function(player) {
    player.cards.push(this);
}

Card.prototype.isCalled = function(number) {
    return this.calledNumbers.indexOf(number) >= 0;
};

Card.prototype.hasBingo = function() {
    // if every number in a column has been called, we have bingo!
    var that = this;
    for (var colIndex in this.cells) {
        if (this.cells[colIndex].every(function(number) { return that.isCalled(number); })) {
            return true;
        }
    }
    // or, if every row in a column has been called
    for (var row = 0; row < 5; row++) {
        var allSelected = true;
        for (var colIndex in this.cells) {
            var column = this.cells[colIndex];
            var cellValue = ((colIndex === 'n') && (row > 1)) ? column[row - 1] : column[row];
            if (this.isCalled(cellValue)) {
                allSelected = false;
                break;
            }
        }
        if (allSelected)
            return true;
    }
    // or, a diagonal match, bottom-left to top-right
    if (this.isCalled(cells.b[4]) && this.isCalled(cells.i[3]) && this.isCalled(cells.g[1]) && this.isCalled(cells.o[0])) {
        return true;
    }
    // or, a diagonal match, top-left to bottom-right
    if (this.isCalled(cells.b[0]) && this.isCalled(cells.i[1]) && this.isCalled(cells.g[3]) && this.isCalled(cells.o[4])) {
        return true;
    }

    // otherwise, no bingo
    return false;
}

/* ------------ end card.js ------------ */

// use the Unix file descriptor as a unique identifier for the connection
// this will not work under Windows
function fd(connection) {
    return connection.socket._handle.fd;
}

function handleJoinRequest(connection, match) {

    console.log('handleJoinRequest(' + fd(connection) + ',', match);

    if (active_connections[fd(connection)]) {
        var player = active_connections[fd(connection)];
        var errorText = "You are already connected to match " + player.match.id;
        connection.sendUTF(JSON.stringify({error: errorText}));
        return;
    }
    // players can only join idle matches
    else if (match) {
        // register the new active connection
        var idle_player = idle_connections[fd(connection)];
        active_connections[fd(connection)] = idle_player;
        match.addPlayer(idle_player);
        delete idle_connections[fd(connection)];

        // give the new player a card and the list of active players
        var card = new Card();
        card.setPlayer(idle_player);
        var welcomeMsg = JSON.stringify({welcome : {
            card : card,
            match : match.id,
            players : match.players.map(function(player) {
                return {id : player.id, nick : player.nick};
            })}});
        connection.sendUTF(welcomeMsg);

        // notify other players of the new player's arrival
        idle_player.notifyPeers(JSON.stringify({joined : {match : match.id, nick : idle_player.nick}}));

        console.log((new Date()) + ' Current connections: ' + Object.keys(active_connections).length);
    }
}

function handleLeaveRequest(player) {
    if (!player) {
        return;
    }

    delete active_connections[player.id];
    idle_connections[player.id] = player;

    if (!player.match) {
        return;
    }

    var match = player.match;
    console.log('player ' + player.nick + ' is leaving match ' + match.id);

    player.notifyPeers(JSON.stringify({left : {nick : player.nick}}));

    var index = match.players.indexOf(player);
    console.log("before removal, match player count=" + match.players.length);
    match.removePlayer(player);
    console.log("after removal, match player count=" + match.players.length);

    if (match.players.length === 0) {
        console.log('Removing player from match');
        if (idle_matches[match.id]) {
            console.log("match is idle, doing nothing");
        }
        else if (active_matches[match.id]) {
            delete active_matches[match.id];
        }
    }
}

function handleCloseEvent(connection) {
    var invalidFd = -1;

    // linear search is painful but by the time we receive this notification the 
    // socket has already been cleaned up
    for (descriptor in active_connections) {
        if (connection === active_connections[descriptor].connection) {
            invalidFd = descriptor;
            break;
        }
    }
    for (descriptor in idle_connections) {
        if (connection == idle_connections[descriptor]) {
            invalidFd = descriptor;
            break;
        }
    }

    if (invalidFd >= 0) {
        handleLeaveRequest(active_connections[invalidFd]);
        delete active_connections[invalidFd];
        delete idle_connections[invalidFd];
    }
    else {
        console.log("unable to remove expired fd");
    }
}

wsServer.on('request', function(request) {
    if (!originIsAllowed(request.origin)) {
      // Make sure we only accept requests from an allowed origin
      request.reject();
      console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
      return;
    }

    try {
        var connection = request.accept('bingo.protocol.mandeluna.com', request.origin);
    }
    catch (e) {
        console.log('Connection failed: ' + e);
        return;
    }
    console.log((new Date()) + ' Connection accepted.');

    idle_connections[fd(connection)] = new Player(connection);

    connection.on('message', function(message) {

        console.log("Received message from:", fd(connection));

        if (message.type === 'utf8') {
            console.log('Received Message: ' + message.utf8Data);

            // Need to ensure JSON data can be parsed
            try {
                var command = JSON.parse(message.utf8Data);
            }
            catch (e) {
                console.log(e);
                return;
            }

            if (command.join) {
                var join = command.join;
                if (join.match >= 0) {
                    var id = join.match;
                    handleJoinRequest(connection, idle_matches[id]);
                }
                else {
                    console.log("Join request received but no match specified", command);
                }
                return;
            }

            var player = active_connections[fd(connection)];
            if (!player) {
                console.log("Unable to identify active player for connection", connection);
                return;
            }

            // leave the match
            if (command.leave) {
                handleLeaveRequest(player);
            }
            // change nick
            else if (command.nick) {
            }
            // say something to the room
            else if (command.say) {
            }
            // say something to another player
            else if (command.whisper) {
            }
            // buy a card
            else if ('card' in command) {
                console.log("Processing new card request for ", player.id);
                if (player.match.isIdle()) {
                    var card = new Card();
                    card.setPlayer(player);
                    player.connection.sendUTF(JSON.stringify({card:card}));
                }
                else {
                    var errorText = 'Match has started';
                    player.connection.sendUTF(JSON.stringify({error:errorText}));
                }
                return;
            }
            // report a win
            else if (command.bingo) {
                // validate the bingo
                if (player.validate_bingo(command.bingo)) {
                    player.winnings += player.match.jackpot;
                    player.connection.sendUTF(JSON.stringify({status:{winnings:player.winnings}}));
                    delete active_matches[player.match.id];
                    player.reset();
                    player.notifyPeers(player.nick + " has won the jackpot");
                }
                else {
                    var errorText = 'Not a valid bingo';
                    player.connection.sendUTF(JSON.stringify({error:errorText}));
                }
                return;
            }
        }
        else if (message.type === 'binary') {
            console.log('Received Binary Message of ' + message.binaryData.length + ' bytes');
        }

        if (active_connections[fd(connection)]) {
            var nick = player.nick;
            console.log('Received Message from ' + nick + ' connection=' + fd(connection));
            player.notifyPeers(JSON.stringify({say : message.utf8Data, nick : nick}));
        }

    });
    connection.on('close', function(reasonCode, description) {
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected: ' + reasonCode + ' ' + description);
        handleCloseEvent(connection);
    });
});
