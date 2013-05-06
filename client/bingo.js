/**
 * bingo.js - Client-side Javascript for bingo
 *
 * 04 May 2013 - Steven Wart created this file
 */

$(document).ready(function() {

/* ------------ card.js ------------ */

var cards = [];
var players = [];

function Card(data) {
  this.cells = {}
    for (var label in data.cells) {
      // sort the cell data numerically
      this.cells[label] = data.cells[label].sort(function(a, b) {
        return (a - b);
      });
    }
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

  function pad(number) {
    var str = '' + number;
    while (str.length < 2) {
      str = '0' + str;
    }
    return str;
  }

  function joinMatch(id) {
    ws.send(JSON.stringify({join : {match : id}}));
  }

  function timeoutString(timeout) {
    var seconds = timeout / 1000;
    if (seconds > 120) {
      var minutes = Math.floor(seconds / 60);
      var time = minutes + ' minutes';
    }
    else if (seconds > 60) {
      var time = '1 minute';
    }
    else {
      var time = '0:' + pad(seconds % 60) + ' seconds';
    }
    return time;
  }

  function updateIdleMatches(idle_matches) {
    $('#idle_matches').show('slow');
    $('#active_match').hide('slow');

    $('#matches').empty();
    idle_matches.forEach(function(match) {
      var item = document.createElement("li");
      var time = timeoutString(match.timeout);

      item.innerHTML = 'Match ' + match.id +
        ' starts in ' + time +
        ' ' + match.num_players + ' players' +
        ' jackpot is ' +  match.jackpot + ' coins';

       item.addEventListener('click', function() {
          joinMatch(match.id);
        });

      $('#matches').append(item);
    });
  }

  function addStampEventListener(square) {
    square.addEventListener('click', function() {
      if (square.className === 'stamped') {
        square.className = undefined;
      }
      else {
        square.className = 'stamped';
      }
    });
  }

  /*
   * Create a bingo card with the following layout
   *
   * +---+---+---+---+---+
   * | B | I | N | G | O |
   * +---+---+---+---+---+
   * | 1 | 1 | 1 | 1 | 1 |
   * | 2 | 2 | 2 | 2 | 2 |
   * | 3 | 3 | * | 3 | 3 |
   * | 4 | 4 | 4 | 4 | 4 |
   * | 5 | 5 | 5 | 5 | 5 |
   * +---+---+---+---+---+
   */

  function buildCard(cardData) {
    // ensure the columns are sorted
    var card = new Card(cardData);
    cards.push(card);

    var cardTable = document.createElement('table');
    var row = document.createElement('tr');
    ['B', 'I', 'N', 'G', 'O'].forEach(function(label) {
      var square = document.createElement('td');
      square.className = 'card-label';
      row.appendChild(square);
      square.innerHTML = label;
    });
    cardTable.appendChild(row);

    for (var rowIndex=0; rowIndex < 5; rowIndex++) {
      var row = document.createElement('tr');
      ['b', 'i', 'n', 'g', 'o'].forEach(function(colIndex) {
        var square = document.createElement('td');
        var column = card.cells[colIndex];
        if ((colIndex === 'n') && (rowIndex == 2)) {
          square.innerHTML = 'Free<br>Square';
          square.className = 'free-square';
        }
        else if ((colIndex === 'n') && (rowIndex > 1)) {
          square.innerHTML = column[rowIndex - 1];
          addStampEventListener(square);
        }
        else {
          square.innerHTML = column[rowIndex];
          addStampEventListener(square);
        }
        row.appendChild(square);
      });
      cardTable.appendChild(row);
    }
    $('#cards').append(cardTable);
  }

  /*
   * Called at startup to programatically add the table for the caller board
   */
  function buildMainboard() {
    var counter = 1;
    ['B', 'I', 'N', 'G', 'O'].forEach(function(rowLabel) {
      var row = document.createElement('tr');
      var square = document.createElement('td');
      square.className = 'mainboard-label';
      row.appendChild(square);
      square.innerHTML = rowLabel;
      for (var col=0; col<15; col++) {
        square = document.createElement('td');
        square.innerHTML = counter++;
        row.appendChild(square);
      }
      $('#mainboard').append(row);
    });
  }

  function refreshMainboard() {
    cards = [];
    $('#cards table').remove();
    $('#mainboard tr td:gt(0)').removeClass('called-square');
  }

  function buyCard() {
    ws.send('{"card" : null}');
  }

  function returnToMatchList() {
    ws.send(JSON.stringify({leave : {match : match.id}}));
  }

  function updatePlayerList() {
    $('#players').html('<span id="player-header">Players:</span>' + players.join(', '));
  }

  function handlePlayerLeaving(left) {
    console.log('Player leaving ' + left);
    players.splice(players.indexOf(left.nick), 1);
    updatePlayerList();
  }

  var match;

  function handlePlayerJoining(joined) {
    console.log('Player joining ' + joined);
    
    // don't add the player if it's already in the list (e.g. the current player)
    if (players.indexOf(joined.nick) >= 0)
      return;

    players.push(joined.nick);
    match = joined.match;
    updatePlayerList();
  }

  function handleWelcomeMessage(welcome) {
    $('#idle_matches').hide('slow');
    $('#active_match').show('slow');

    refreshMainboard();
    
    buildCard(welcome.card);

    players = welcome.players.map(function(ea){
      return ea.nick;
    });
    updatePlayerList();
  }

  // convert a number from 1-75 to the letter it corresponds to
  function calledLetter(call) {
      var rowIndex = Math.floor(call / 15);
      return ['B', 'I', 'N', 'G', 'O'][rowIndex];
  }

  function handleStatusUpdate(status) {
    if (status.call) {
      var call = status.call;
      $('#match').html(call);
      var rowIndex = Math.floor(call / 15);
      var colIndex = call % 15;
      // bypass the label row
      if (colIndex == 0) {
        colIndex = 15;
        rowIndex = rowIndex - 1;
      }
      var square = document.getElementById('mainboard').rows[rowIndex].cells[colIndex];
      square.className = 'called-square';
    }
    else if (status.timeout) {
      $('#match').html('match starts in ' + timeoutString(status.timeout, true));
    }
    else if (status.winnings) {
      var winnings = status.winnings;
    }
  }

  function handleNotification(notify) {
    $('#match').html('match is over. return to match list');
    addLineToChatlog(notify);
  }

  function installEventHandlers(ws) {
      if (ws.isOpened()) {
          addLineToChatlog('The connection is already open.', 'warning');
          return;
      }

      var uid = $('#uid').val();
      if ('' == uid) {
          addLineToChatlog('Please enter a name.', 'warning');
          return;
      }

      // addLineToChatlog('Trying to connect to "' + ws.uri + '"...', 'info');

      try {
          // Triggers event onopen on success.
          ws.open();

          ws.socket.onopen = function() {
            refreshUserInterface(ws);
            addLineToChatlog('Welcome to our Bingo hall. Please excuse the mess!', 'info');
            // Send the username to authenticate the chat client at the
            // chat server.
            ws.send(uid);
          }

          ws.socket.onmessage = function(msg) {
            var data = $.parseJSON(msg.data);
            console.log('received message ', data);
            if (data.idle_matches) {
              updateIdleMatches(data.idle_matches)
            }
            else if (data.welcome) {
              handleWelcomeMessage(data.welcome);
            }
            else if (data.card) {
              buildCard(data.card);
            }
            else if (data.status) {
              handleStatusUpdate(data.status);
            }
            else if (data.notify) {
              handleNotification(data.notify);
            }
            else if (data.left) {
              handlePlayerLeaving(data.left);
            }
            else if (data.joined) {
              handlePlayerJoining(data.joined);
            }
          }

          ws.socket.onclose = function() {
            refreshUserInterface(ws);
            addLineToChatlog('The connection has been closed.', 'info');
          }
      } catch (ex) {
          addLineToChatlog('Exception: ' + ex, 'error');
      }
  }

  function addLineToChatlog(text, type) {
      $('#chatlog').append('<li class="' + type + '">' + text + '</li>');
  }

  function refreshUserInterface(ws) {
      var disabled = ws.isClosed();
      $('#uid').attr('disabled', !disabled);
      $('#msg').attr('disabled', disabled);
      $('#send').attr('disabled', disabled);
  }

var config = null;

  $.ajax({
      url: 'config.json',
      async: false,
      dataType: 'json',
      success: function(response) {
          config = response;
      },
      error: function(response) {
          $('#chatclient').fadeOut('slow');
          $('<p>Unable to read the JSON configuration file.</p>')
              .appendTo('[role="main"]');
      }
  });

  // addLineToChatlog('The chat client has been loaded.', 'info');

  if (!('WebSocket' in window)) {
      $('#chatclient').fadeOut('slow');
      $('<p>Your web browser is not supported. Please use one of the free browsers listed below:</p>')
          .prependTo('[role="main"]');
  } else {
      // The web browser does support the WebSocket protocol.
      var ws = new WebSocketConnection(
          config.host, config.port, config.resource, config.secure,
          config.protocols
      );

      refreshUserInterface(ws);
      installEventHandlers(ws);
  }

  /**
   * Send data via the WebSocket if the "Send" button is clicked.
   *
   * @event
   */
  $('#say').click(function() {
      handleSend();
  });

  /**
   * Send data via the WebSocket if the "Return" keyboard key is pressed.
   *
   * @event
   */
  $('#text').keypress(function(event) {
      if (event.keyCode == '13') {
          handleSend();
      }
  });

  /**
   * Sends data via the specified WebSocket and sets the correct state of
   * the user interface.
   *
   * @param {WebSocket} socket The WebSocket to send data with.
   *
   * @returns {void}
   * @function
   */
  function handleSend() {
      if (ws.isClosed()) {
          addLineToChatlog('Establish a connection first.', 'warning');
          return;
      }

      var msgInputField = $('#msg');
      var msg = msgInputField.val();
      if ('' == msg) {
          addLineToChatlog('Please enter a message.', 'warning');
          return;
      }

      try {
          ws.send(msg);
          msgInputField.val('');
      } catch (ex) {
          addLineToChatlog('Exception: ' + ex, 'error');
      }
  }

  buildMainboard();

  /**
   * Return to match list
   */
  $('#matchlist').click(function() {
    returnToMatchList();
  });

  /**
   * Change user name
   */
  $('#nick').click(function() {
      changeNick();
  });

  /**
   * Buy a new bingo card
   */
  $('#buycard').click(function() {
      buyCard();
  });


});