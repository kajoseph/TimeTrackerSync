'use strict';

var _client = null,
    _baseurl = null;

var Client = require('node-rest-client').Client,
	constants = require('constants');

module.exports = function(config){
    var repo = {};
    
    _baseurl = "https://" + (config.baseUrl || process.env.TARGETPROCESS_BASEURL) + "/api/v1/";

    var options = {
        // customize mime types for json or xml connections 
        mimetypes: {
            json: ["application/json", "application/json;charset=utf-8"],
            xml: ["application/xml", "application/xml;charset=utf-8"]
        },
        user: (config.userName || process.env.TARGETPROCESS_USERNAME),      // basic http auth username if required 
        password: (config.password || process.env.TARGETPROCESS_PASSWORD),  // basic http auth password if required 
        requestConfig: {
            timeout: 1000,              //request timeout in milliseconds 
            noDelay: true,              //Enable/disable the Nagle algorithm 
            keepAlive: true,            //Enable/disable keep-alive functionalityidle socket. 
            keepAliveDelay: 1000        //and optionally set the initial delay before the first keepalive probe is sent 
        },
        responseConfig: {
            timeout: 20000              //response timeout 
        },
        testMode: config.test || process.env.TARGETPROCESS_TEST
    };

    _client = new Client(options);

    repo.getEntityById = function(id, onSuccess, onError) {
        var args = {
            headers: {"Accept": "application/json"},
            path: {
                "id": id
            }
        };

        _client.get(_baseurl + "Assignables/${id}", args,
        function (data, response) {
            if (response.statusCode >= 200 && response.statusCode < 300)
            {
                if (onSuccess != null)
                    onSuccess(data, response)
            }
            else {
                if (onError != null)
                    onError(data, response);
            }
            
        });
    }

    // targetProcess.postTimeEntry(entity.Id, timeEntry.entryDate, timeEntry.spent, remaining, onSuccess);
    repo.postTimeEntry = function(entityId, userId, description, timeDate, timeSpent, timeRemaining, onSuccess, onError)
    {
        var assignable = {Id: entityId},
            user = {Id: userId};

        var args = {
            headers: {"Content-Type": "application/json", "Accept": "application/json"},
            data: {
                Spent: timeSpent,
                Remain: timeRemaining,
                IsEstimation: false,
                Date: timeDate,
                Assignable: assignable,
                User: user
            }
        };

        if (options.testMode) {
			if (onSuccess != null) {
				onSuccess({ 
                    sourceId: -1,
                    newNote: '<< TEST >> ' + description + ' (' + 'TPID: -1)',
                    summary: JSON.stringify(args.data)
                });
            }
		}
		else {
            _client.post(_baseurl + "Times", args,
                function (data, response) {
                    if (response.statusCode >= 200 && response.statusCode < 300)
                    {
                        data.newNote = description + ' (' + 'TPID: ' + data.Id + ')';
                        data.summary = 'Added new time entry for ' + data.newNote;

                        if (onSuccess != null)
                            onSuccess(data, response)
                    }
                    else {
                        if (onError != null)
                            onError(data, response);
                    }
                    
                });
        }
    }

    repo.parseTimeEntry = function(dayEntry, userId) {
        var match = /^\#(?!\#)([0-9]+)(?:)/;
        var remainingMatch = /(?!=\(R:)\d+(\.\d+)*(?=\).*$)/;
        var timeRemaining = null;		// default time remaining to subtract to the time spent from remaining effort
        var timeEntry = {};
    
        var matches = dayEntry.notes.match(match);

        if (matches == null || matches.length < 2) {
            return null;
        }

        var timeRemainingMatches = dayEntry.notes
            .replace(":.", ":0.")	// handle cases where the remaining time is entered as "(R:.5)" for half an hour
            .match(remainingMatch);
    
        if (matches == null || matches.length == 0)
            return null;
    
        if (timeRemainingMatches != null && timeRemainingMatches.length > 0) {
            timeRemaining = parseFloat(timeRemainingMatches[0]);
        }
    
        timeEntry.id = parseInt(matches[1]);
        timeEntry.userId = userId;
        timeEntry.entryDate = new Date(dayEntry.spent_at);
        timeEntry.spent = dayEntry.hours;
        timeEntry.remain = timeRemaining;				// Set to NULL for now until I add functionality to parse the notes for remaining time
        timeEntry.notes = dayEntry.notes;
        timeEntry.sourceId = dayEntry.id;
    
        return timeEntry;
    }

    return repo;
};