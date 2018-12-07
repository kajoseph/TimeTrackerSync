'use strict';

var Client = require('node-rest-client').Client,
	constants = require('constants');

var _client = null,
	_baseurl = null;

module.exports = function(config){
	var repo = {};

	_baseurl = "https://" + (config.baseUrl || process.env.HARVEST_BASEURL);

	var options = {
		// customize mime types for json or xml connections 
		mimetypes: {
			json: ["application/json", "application/json;charset=utf-8"],
			xml: ["application/xml", "application/xml;charset=utf-8"]
		},
		user: (config.userName || process.env.HARVEST_USERNAME), 			// basic http auth username if required 
		password: (config.password || process.env.HARVEST_PASSWORD), 		// basic http auth password if required 
		requestConfig: {
			timeout: 1000, 				//request timeout in milliseconds 
			noDelay: true, 				//Enable/disable the Nagle algorithm 
			keepAlive: true, 			//Enable/disable keep-alive functionalityidle socket. 
			keepAliveDelay: 1000 		//and optionally set the initial delay before the first keepalive probe is sent 
		},
		responseConfig: {
			timeout: 20000 				//response timeout 
		},
		testMode: config.test || process.env.HARVEST_TEST
	};

	_client = new Client(options);

	repo.getTimeEntries = function(userId, from, to, onSuccess, onError) {
		var args = {
			headers: {"Accept": "application/json"},
			path: {
				"userId": userId,
				"from": from,
				"to": to
			}
		};

		_client.get(_baseurl + "/people/${userId}/entries?from=${from}&to=${to}", args,
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

	repo.completeTimeEntry = function(entryId, completedTaskId, notes, onSuccess, onError) {
		var args = {
			headers: {"Content-Type": "application/json", "Accept": "application/json"},
			path: {
				"id": entryId
			},
			data : {
				task_id: completedTaskId,
				notes: notes
			}
		};

		if (options.testMode) {
			if (onSuccess != null) {
				onSuccess();
			}
		}
		else {
			_client.post(_baseurl + "/daily/update/${id}", args,
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
	}

	return repo;
};



