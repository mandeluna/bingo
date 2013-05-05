/**
 * bingo.js - Client-side Javascript for bingo
 *
 * 04 May 2013 - Steven Wart created this file
 */

$(document).ready(function() {

    function addLineToChatlog(text, type) {
        $('#chatlog').append('<li class="' + type + '">' + text + '</li>');
    }

    function refreshUserInterface(ws) {
        var disabled = ws.isClosed();
        $('#uid').attr('disabled', !disabled);
        $('#msg').attr('disabled', disabled);
        $('#send').attr('disabled', disabled);
    }

    function pad(number) {
      var str = '' + number;
      while (str.length < 2) {
        str = '0' + str;
      }
      return str;
    }

    function updateIdleMatches(idle_matches) {
      $('#matches').empty();
      idle_matches.forEach(function(match) {
        var seconds = match.timeout / 1000;
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
        $('#matches').append('<li class="match">Match ' + match.id +
          ' starts in ' + time +
          ' ' + match.num_players + ' players' +
          ' jackpot is ' +  match.jackpot + ' coins' +
          '</li>');
      });
    }

    function installEventHandlers(ws) {
        if (ws.isOpened()) {
            addLineToChatlog('The connection is already open.', 'warning');
            return;
        }

        var uid = $('#uid').val();
        if ('' == uid) {
            addLineToChatlog('Please enter an username.', 'warning');
            return;
        }

        addLineToChatlog('Trying to connect to "' + ws.uri + '"...', 'info');

        try {
            // Triggers event onopen on success.
            ws.open();

            ws.socket.onopen = function() {
                refreshUserInterface(ws);
                addLineToChatlog('The connection has been opened.', 'info');
                // Send the username to authenticate the chat client at the
                // chat server.
                ws.send(uid);
            }

            ws.socket.onmessage = function(msg) {
                var data = $.parseJSON(msg.data);
                if (data.idle_matches) {
                  updateIdleMatches(data.idle_matches)
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

    addLineToChatlog('The chat client has been loaded.', 'info');

    if (!('WebSocket' in window)) {
        $('#chatclient').fadeOut('slow');
        $('<p>The web browser does not support the WebSocket protocol.</p>')
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
});