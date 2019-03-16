'use strict';

var _jiraclient = null,
    _tempoclient = null,
    _baseurl = null,
    _tempourl = null,
    _tempoauth = null,
    _jirauser = null;

var client = require('node-rest-client').Client,
	constants = require('constants');

module.exports = function(config, tempoConfig){
    var repo = {};
    
    _baseurl = "https://" + (config.baseUrl || process.env.JIRA_BASEURL) + "/rest/";
    _tempourl = "https://" + (tempoConfig.baseUrl || process.env.TEMPO_BASEURL) + "/2/";
    _tempoauth = "Bearer " + (tempoConfig.apiToken || process.env.TEMPO_APITOKEN);
    _jirauser = (config.userName || process.env.JIRA_USERNAME);

    var jiraOptions = {
        // customize mime types for json or xml connections 
        mimetypes: {
            json: ["application/json", "application/json;charset=utf-8"],
            xml: ["application/xml", "application/xml;charset=utf-8"]
        },
        user: (config.userId || process.env.JIRA_USERID),      // basic http auth username if required 
        password: (config.apiToken || process.env.JIRA_APITOKEN),  // basic http auth password if required 
        requestConfig: {
            timeout: 1000,              //request timeout in milliseconds 
            noDelay: true,              //Enable/disable the Nagle algorithm 
            keepAlive: true,            //Enable/disable keep-alive functionality idle socket. 
            keepAliveDelay: 1000        //and optionally set the initial delay before the first keepalive probe is sent 
        },
        responseConfig: {
            timeout: 20000              //response timeout 
        },
        testMode: config.test || process.env.JIRA_TEST
    };

    var tempoOptions = {
        // customize mime types for json or xml connections 
        mimetypes: {
            json: ["application/json", "application/json;charset=utf-8"],
            xml: ["application/xml", "application/xml;charset=utf-8"]
        },
        requestConfig: {
            timeout: 1000,              //request timeout in milliseconds 
            noDelay: true,              //Enable/disable the Nagle algorithm 
            keepAlive: true,            //Enable/disable keep-alive functionality idle socket. 
            keepAliveDelay: 1000        //and optionally set the initial delay before the first keepalive probe is sent 
        },
        responseConfig: {
            timeout: 3000              //response timeout 
        },
        testMode: config.test || process.env.JIRA_TEST
    };

    _jiraclient = new client(jiraOptions)
        .on('error', function(err) {
            console.error('ERROR! There was an error accessing the Jira API!', err);
        });

    _tempoclient = new client(tempoOptions)
        .on('error', function(err) {
            console.error('ERROR! There was an error accessing the Tempo API!', err);
        });

    repo.getTimeAccounts = function(onSuccess, onError) {
        var args = {
            headers: { 
                "Authorization": _tempoauth,
                "Accept": "application/json"
            }
        };

        var isComplete = false;
        var accountLookup = [];

        _tempoclient.get(_tempourl + "accounts", args,
            function(data, response) 
            {
                if (response.statusCode >= 200 && response.statusCode < 300) {
                    for (var i = 0; i < data.results.length; i++) {
                        accountLookup.push({
                            self: data.results[i].self,
                            key: data.results[i].name,
                            account: data.results[i].key
                        });
                    }

                    data.isComplete = true;
                    data.accounts = accountLookup;

                    if (onSuccess != null)
                        onSuccess(data, response)
                }
                else {
                    data.isComplete = true;

                    if (onError != null) {
                        onError(data, response);
                    }
                }
            });
    }

    repo.getEntityById = function(id, accounts, onSuccess, onError) {
        var args = {
            headers: {"Accept": "application/json"},
            path: {
                "id": id
            }
        };

        // include the "customfield_10038" to get the default account
        _jiraclient.get(_baseurl + "api/2/issue/${id}?fields=summary,timetracking,description,project,customfield_10038", args,
        function (data, response) {
            if (response.statusCode >= 200 && response.statusCode < 300)
            {
                if (data.fields.customfield_10038 == null) {
                    onSuccess(data, response);
                }
                else {
                    var accountName = data.fields.customfield_10038.value;    
                    // lookup account name from list and set data accordingly
                    data.accountKey = lookupAccountKey(accounts, accountName);
                    onSuccess(data, response);
                }
            }
            else {
                if (onError != null)
                    onError(data, response);
            }
        });
    }

    var lookupAccountKey = function(list, key) {
        for (var i = 0; i < list.length; i++) {
            if (list[i].key === key) {
                return list[i].account;
            }
        }

        return null;
    }

    // jira.postTimeEntry(entity.Id, timeEntry.entryDate, timeEntry.spent, remaining, onSuccess);
    repo.postTimeEntry = function(entityId, userId, description, timeDate, timeSpent, timeRemaining, accountKey, onSuccess, onError)
    {
        var workAttributeValuesArray = [];

        workAttributeValuesArray.push({
           value: accountKey,
           key: "_Account_"
        });

        var args = {
            headers: {
                "Content-Type": "application/json", 
                "Accept": "application/json",
                "Authorization": _tempoauth
            },
            data: {
                authorUsername: _jirauser,
                description: description,
                issueKey: entityId,
                startDate: timeDate.toISOString().slice(0, 10),
                startTime: "00:00:00",
                timeSpentSeconds: timeSpent,
                remainingEstimateSeconds: timeRemaining,
                attributes: workAttributeValuesArray
            }
        };

        var noteText = '!' + entityId + ': ' + description;

        if (tempoOptions.testMode) {
			if (onSuccess != null) {
				onSuccess({ 
                    id: -1,
                    newNote: '<< TEST >> ' + noteText + ' (' + 'JiraID: -1)',
                    summary: JSON.stringify(args.data)
                });
            }
		}
		else {
            _tempoclient.post(_tempourl + "worklogs", args,
            function (data, response) {
                if (response.statusCode >= 200 && response.statusCode < 300)
                {
                    data.newNote = noteText + ' (' + 'JiraID: ' + data.jiraWorklogId + ')';
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
        // Return object
        var timeEntry = {};

        // Harvest has notes
        if(dayEntry.notes){
            var match = /^\!(?!\!)([a-zA-Z0-9\-]+)(?:)/;
            var remainingMatch = /\(R:[ \d]+(\.\d+)*\)$/;
            var timeRemaining = 1;      // Default to one hour unless noted othewise
        
            var matches = dayEntry.notes.match(match);

            if (matches == null || matches.length < 2) {
                return null;
            }

            // Strip key tag from description
            var description = dayEntry.notes
                .replace("!" + matches[1] + ":", "")
                .trim();

            var timeRemainingMatches = description
                .match(remainingMatch);

            if (timeRemainingMatches != null && timeRemainingMatches.length > 0) {
                var remText = timeRemainingMatches[0];

                // clean up the description first
                description = description
                    .replace(remText, "")
                    .trim();

                var remaining = remText
                    .replace("(R:", "")
                    .replace(")", "")
                    .trim();

                timeRemaining = parseFloat(remaining);
            }
        
    
            timeEntry.id = matches[1];
            timeEntry.userId = userId;
            timeEntry.entryDate = new Date(dayEntry.spent_at);
            timeEntry.spent = dayEntry.hours * 3600;        // This needs to be converted to seconds for "JIRA time"
            timeEntry.remain = timeRemaining * 3600;		// This needs to be converted to seconds for "JIRA time"
            timeEntry.notes = description;
            timeEntry.sourceId = dayEntry.id;
        }
        // Toggle has description
        else if (dayEntry.description){
            var timeEntry = {};

            timeEntry.id = dayEntry.storyId; // JIRA id (e.g. STOREPRO-73)
            timeEntry.userId = userId;                                 // UserId passed in
            timeEntry.entryDate = new Date(dayEntry.start);            // Date the time was logged
            timeEntry.spent = dayEntry.duration;                       // Time duration in seconds
            timeEntry.remain = 0;                                      // This will be calculated at log time
            timeEntry.notes = dayEntry.description + " -- " + JSON.stringify(dayEntry.jiraDescription);// e.g. ["DSS-173 Implement Changes to Reports"]
            timeEntry.sourceId = dayEntry.id                           // Id of Toggl entry
        }

        return timeEntry;
    }

    return repo;
};
