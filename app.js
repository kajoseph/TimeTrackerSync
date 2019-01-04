var config = require('./config.json');
var harvest = require('./repositories/harvestRepository.js')(config.harvest),
	targetProcess = require('./repositories/targetProcessRepository.js')(config.targetProcess),
	jira = require('./repositories/jiraRepository.js')(config.jira, config.tempo),
	toggl = require('./repositories/togglRepository.js')(config.toggl),
	dateFormat = require('dateformat');
	
// CONSTANTS
var TARGETPROCESS_USER_ID = config.targetProcess.userId,
	JIRA_USER_NAME = config.jira.userName,
	COMPLETED_TASK_ID = config.harvest.completedTaskId,
	HARVEST_USER_ID = config.harvest.userId;

var fromDate = new Date();
var toDate = new Date(); 
fromDate.setDate(fromDate.getDate() - 7);		// Sets fromDate to one week prior
//toDate.setDate(toDate.getDate() - 1);			// Sets toDate to one day prior

var fromString = dateFormat(fromDate, "yyyymmdd"),
	toString = dateFormat(toDate, "yyyymmdd");

var fromIsoString = dateFormat(fromDate, "isoUtcDateTime"),
	toIsoString = dateFormat(toDate, "isoUtcDateTime")

fromIsoString = fromIsoString.substring(0,fromIsoString.length - 1) + "+00:00";
toIsoString = toIsoString.substring(0,toIsoString.length - 1) + "+00:00";

var updateTargetProcessTime = function(dayEntry) {
	var timeEntry = targetProcess.parseTimeEntry(dayEntry, TARGETPROCESS_USER_ID);

	// If the timeEntry object is not set, assume it's not a valid TP entry
	if (timeEntry == null) {
		return null;
	}

	// Get the time remaining to update as well
	return targetProcess.getEntityById(timeEntry.id, function(data, response) {
		var entity = data;

		var remaining = entity.TimeRemain;

		// Adjust the remaining amount accordingly
		if (timeEntry.remain == null) {
			if (remaining > timeEntry.spent)		// If the amount of time left on the entity is greater than the time spent
				remaining -= timeEntry.spent;		//	subtract the time spent from remaining to determine the new remaining amount
			else
				remaining = 0;						// Otherwise, if spent >= remaining, set remaining to 0
		}
		else
			remaining = timeEntry.remain;			// If time remaining is specified, don't do any calcs - just set the remaining as specified

		// Push the new time object
		targetProcess.postTimeEntry(entity.Id, timeEntry.userId, timeEntry.notes, timeEntry.entryDate, timeEntry.spent, remaining,
			function(data, response) 
			{
				logTimeEntry(dayEntry.id, data.summary, data.newNote);
			}, function(data, response) {
				console.log('Error updating time for ' + timeEntry.notes + ':  ' + response.statusCode + ' ' + response.statusMessage +
				(data == null ? '(No details provided)' : ' (' + data.Message + ')'));
			});
	},
	function(data, response) {
		console.log('Error retrieving entity with ID ' + timeEntry.id);
	});
}

var timeAccounts = [];

var updateJiraTime = function(dayEntry) {
	var timeEntry = jira.parseTimeEntry(dayEntry, JIRA_USER_NAME);

	// If the timeEntry object is not set, assume it's not a valid TP entry
	if (timeEntry == null) {
		return null;
	}

	// Get the time remaining to update as well
	return jira.getEntityById(timeEntry.id, timeAccounts, function(data, response) {
		var entity = data;

		var remaining = 3600;						// (seconds) default to one hour remaining if not specified

		// Adjust the remaining amount accordingly
		if (data.fields.timetracking.remainingEstimateSeconds != null){
			remaining = data.fields.timetracking.remainingEstimateSeconds - timeEntry.spent;
		}
		else if (timeEntry.remain != null) {
			remaining = timeEntry.remain;			// If time remaining is specified, don't do any calcs - just set the remaining as specified
		}			

		// Push the new time object
		jira.postTimeEntry(entity.key, timeEntry.userId, timeEntry.notes, timeEntry.entryDate, timeEntry.spent, remaining, entity.accountKey,
			function(data, response) 
			{
				logTimeEntry(dayEntry.id, data.summary, data.newNote);
			}, function(data, response) {
				console.log('Error updating time for ' + timeEntry.notes + ':  ' + response.statusCode + ' ' + response.statusMessage +
				(data == null ? '(No details provided)' : ' (' + data.Message + ')'));
			});
	},
	function(data, response) {
		console.log('Error retrieving entity with key ' + timeEntry.id);
	});
}

// Set import methods
var timeProcessors = [];
//timeProcessors.push(updateTargetProcessTime);
timeProcessors.push(updateJiraTime);

//region: Harvest time import to TargetProcess & JIRA

// harvest.getTimeEntries(HARVEST_USER_ID, fromString, toString, function(data, response) {
// 	var dayEntries = data;
// 	var totalToUpdate = 0;

// 	for (var i = 0; i < dayEntries.length; i++) 
// 	{
// 		var dayEntry = dayEntries[i].day_entry;

// 		if (dayEntry.task_id != COMPLETED_TASK_ID) {
// 			totalToUpdate++;
// 			console.log(dayEntry.spent_at + "  " + dayEntry.notes + "  " + dayEntry.hours);

// 			processDayEntry(dayEntry);
// 		}
// 	}

// 	if (totalToUpdate == 0)
// 		console.log('All time is up to date!');
// 	else
// 		console.log(totalToUpdate + ' time records to update.');
// });

// var processDayEntry = function(dayEntry) {
// 	for (var i = 0; i < timeProcessors.length; i++) {
// 		var updateFunction = timeProcessors[i](dayEntry);

// 		if (updateFunction == null) {
// 			continue;
// 		}
// 		else {
// 			updateFunction();
// 			break;
// 		}
// 	}
// }
//endregion

var logTimeEntry = function(sourceId, summary, note) {
	console.log(summary);

	// Upon success, move the time entry to a completed task
	/*
	harvest.completeTimeEntry(sourceId, COMPLETED_TASK_ID, note, 
		function(data, response) { console.log('Completed ' + note);	}
	);
	*/

	toggl.MarkJira(sourceId);
}

var abc = (res) => {
	console.log(res);
}

jira.getTimeAccounts(function(data, response) {
		if (data.isComplete) {
			timeAccounts = data.accounts;

			toggl.GetTimeEntries(fromIsoString, toIsoString, (data) => {
				//Iterate through each time entry
				data.forEach((d,i) => {
					// If the description is ready to be imported (i.e. not blank) and does not have the JIRA tag
					if(d.description && d.description.split(' ')[0].indexOf('-') > -1 && (!d.tags || d.tags.indexOf("JIRA") < 0)){
						//Iterate through each time processor (JIRA, TargetProcess, etc.)
						for(var j = 0; j < timeProcessors.length; j++){
							// If time processor is a function...
							if(typeof(timeProcessors[j]) == "function"){
								var updateTime = timeProcessors[j];
								// ... then run function.
								updateTime(d);
							}
						}

					}
				})
			});
		}
	}, 
	function(data, response){
		throw 'There was an error retrieving the list of time accounts from Tempo: ' + response;
	}
);
