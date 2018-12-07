/*


THIS IS MY PRE-TEMPO UPDATE REPOSITORY.
KEEPING AROUND FOR REFERENCE, IF NEEDED.
-KAJ - 6/28/2018


*/
'use strict';

var _client = null,
    _baseurl = null;

var Client = require('node-rest-client').Client,
	constants = require('constants');

module.exports = function(config){
    var repo = {};
    
    _baseurl = "https://" + (config.baseUrl || process.env.JIRA_BASEURL) + "/rest/";

    var options = {
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
            keepAlive: true,            //Enable/disable keep-alive functionalityidle socket. 
            keepAliveDelay: 1000        //and optionally set the initial delay before the first keepalive probe is sent 
        },
        responseConfig: {
            timeout: 20000              //response timeout 
        },
        testMode: config.test || process.env.JIRA_TEST
    };

    _client = new Client(options);

    repo.getEntityById = function(id, onSuccess, onError) {
        var args = {
            headers: {"Accept": "application/json"},
            path: {
                "id": id
            }
        };

        // include the "customfield_10038" to get the default account
        _client.get(_baseurl + "api/2/issue/${id}?fields=summary,timetracking,description,project,customfield_10038", args,
        function (data, response) {
            if (response.statusCode >= 200 && response.statusCode < 300)
            {

                if (data.fields.customfield_10038 == null) {
                    onSuccess(data, response);
                }
                else {
                    var accountArgs = {
                        headers: { "Accept": "application/json" },
                        path: {
                            "id": data.fields.customfield_10038.id
                        }
                    };
    
                    _client.get(_baseurl + `api/2/issue/${id}`, accountArgs,//"tempo-accounts/1/account/${id}", accountArgs, 
                        function(data2, response2) 
                        {
                            if (response2.statusCode >= 200 && response2.statusCode < 300) {
                                data.accountKey = data2.key;
                                if (onSuccess != null)
                                    onSuccess(data, response)
                            }
                            else {
                                if (onError != null) {
                                    onError(data, response2);
                                }
                            }
                        });
                }
            }
            else {
                if (onError != null)
                    onError(data, response);
            }
        });
    }

    // jira.postTimeEntry(entity.Id, timeEntry.entryDate, timeEntry.spent, remaining, onSuccess);
    repo.postTimeEntry = function(entityId, userId, description, timeDate, timeSpent, timeRemaining, accountKey, onSuccess, onError)
    {
        var issue = {key: entityId, remainingEstimateSeconds: timeRemaining},
            user = {name: userId};
        var workAttributeValuesArray = [];

        workAttributeValuesArray.push({
           value: accountKey,
           workAttribute: {
               name: "Account",
               type: {
                   name: "Account",
                   value: "ACCOUNT"
               },
               key: "_Account_"
           } 
        });

        var args = {
            headers: {"Content-Type": "application/json", "Accept": "application/json"},
            data: {
                author: user,
                comment: description,
                issue: issue,
                dateStarted: timeDate,
                timeSpentSeconds: timeSpent,
                workAttributeValues: workAttributeValuesArray
            },
            auth: `${config.email}:${config.password}`
        };

        var noteText = '!' + entityId + ': ' + description;

        if (options.testMode) {
			if (onSuccess != null) {
				onSuccess({ 
                    id: -1,
                    newNote: '<< TEST >> ' + noteText + ' (' + 'JiraID: -1)',
                    summary: JSON.stringify(args.data)
                });
            }
		}
		else {
            _client.post(_baseurl + `api/2/issue/${entityId}/worklog`, args,//"tempo-timesheets/3/worklogs", args,
            function (data, response) {
                if (response.statusCode >= 200 && response.statusCode < 300)
                {
                    data.newNote = noteText + ' (' + 'JiraID: ' + data.id + ')';
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

        // If imported from Harvest (using David Bettis' logging convention)
        if(dayEntry.notes){
            var match = /^\!(?!\!)([a-zA-Z0-9\-]+)(?:)/;
            var remainingMatch = /\(R:[ \d]+(\.\d+)*\)$/;
            var timeRemaining = 1;      // Default to one hour unless noted othewise
            var timeEntry = {};
        
            var matches = matches = dayEntry.notes.match(match);

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
        // If imported from Toggl (using Kenny's loggin convention: description starts w/ JIRA US/task id (e.g. STOREPRO-73))
        else if (dayEntry.description){
            var timeEntry = {};

            timeEntry.id = dayEntry.description.split(' ')[0].trim(); // JIRA id (e.g. STOREPRO-73)
            timeEntry.userId = userId;                                // UserId passed in
            timeEntry.entryDate = new Date(dayEntry.start);           // Date the time was logged
            timeEntry.spent = dayEntry.duration;                      // Time duration in seconds
            timeEntry.remain = 0;                                     // This will be calculated at log time
            timeEntry.notes = dayEntry.description;                   // e.g. "DSS-173 Implement Changes to Reports"
            timeEntry.sourceId = dayEntry.id                          // Id of Toggl entry
        }
        return timeEntry;
    }

    return repo;
};
