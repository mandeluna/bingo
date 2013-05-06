#!/usr/bin/env node
var WebSocketClient = require('websocket').client;

var client = new WebSocketClient();

/* ------------ card.js ------------ */

var cards = [];
var players = [];

function Card(data) {
    this.cells = data.cells;
    console.log('cells=', this.cells);
    this.calledNumbers = [];
}

Card.prototype.isCalled = function(number) {
    return this.calledNumbers.indexOf(number) >= 0;
};

Card.prototype.hasBingo = function() {
    // if every number in a column has been called, we have bingo!
    var that = this;
    for (var colIndex in this.cells) {
        if (this.cells[colIndex].every(function(number) { return that.isCalled(number); })) {
            this.selectedColumn = colIndex;
            return true;
        }
    }
    // or, if every row in a column has been called
    for (var rowIndex = 0; rowIndex < 5; rowIndex++) {
        var row = Object.keys(this.cells).map(function(colIndex) {
            var column = that.cells[colIndex];
            return ((colIndex === 'n') && (rowIndex > 1)) ? column[rowIndex - 1] : column[rowIndex];
        });
        if (row.every(function(number) { return that.isCalled(number); })) {
            this.selectedRow = rowIndex;
            return true;
        }
    }
    var cells = this.cells;
    // or, a diagonal match, bottom-left to top-right
    if (this.isCalled(cells.b[4]) && this.isCalled(cells.i[3]) && this.isCalled(cells.g[1]) && this.isCalled(cells.o[0])) {
        this.diagonalMatch = 'bottom-to-top';
        return true;
    }
    // or, a diagonal match, top-left to bottom-right
    if (this.isCalled(cells.b[0]) && this.isCalled(cells.i[1]) && this.isCalled(cells.g[3]) && this.isCalled(cells.o[4])) {
        this.diagonalMatch = 'top-to-bottom';
        return true;
    }
    // otherwise, no bingo
    return false;
}

/* ------------ end card.js ------------ */

client.on('connectFailed', function(error) {
    console.log('Connect Error: ' + error.toString());
});

client.on('connect', function(connection) {
    console.log('WebSocket client connected');
    connection.on('error', function(error) {
        console.log("Connection Error: " + error.toString());
    });
    connection.on('close', function() {
        console.log('echo-protocol Connection Closed');
    });
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            console.log("Received: '" + message.utf8Data + "'");
            var data = JSON.parse(message.utf8Data);

            // list of matches client can connect to
            if (data.idle_matches) {
                var next_match = data.idle_matches[0];
                connection.sendUTF(JSON.stringify({join : {match : next_match.id}}));
            }
            else if (data.status) {
                var status = data.status;
                if (status.call) {
                    cards.forEach(function(card) {
                        card.calledNumbers.push(status.call);
                        if (card.hasBingo()) {
                            connection.sendUTF(JSON.stringify({bingo:card}));
                        }
                    });
                }
            }
            else if (data.welcome) {
                var welcome = data.welcome;
                cards = [];
                cards.push(new Card(welcome.card));
            }
            else if (data.card) {

            }
            else if (data.notify) {

            }
            else if (data.say) {

            }
            else if (data.whisper) {

            }
            else if (data.error) {

            }
        }
    });

});

client.connect('ws://localhost:8888/', 'bingo.protocol.mandeluna.com');