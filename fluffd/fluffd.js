/*
 * fluffd: Furby Bluetooth Low Energy / Bluetooth Smart Communication Server:
 * Connect to Furby, start fluff server:
 * node fluffd.js
 *
 * Connect to Furby, show all BLE services and characteristics and exit:
 * node main.js introspect
 *
 * fluffd acts as an HTTP server. It processes your action requests and reports
 * events such as sensor input (wiggling antenna, petting, feeding, ...) that
 * occurs to the Furby Connect.
 *
 * HTTP Request Format for Commands:
 * Commands are POST requests in the form http://[HOST]:3872/cmd/[NAME]
 * This will execute the command name "NAME".
 * The POST data has to be a JSON-encoded string containing:
 *	- params: parameters passed on to the command (optional)
 *	- target: UUID of Furby to execute the command on. If not provided, command will be executed on all connected furbies.
 */

// System: HTTP server and Bluetooth Low Energy Library
const winston = require("winston");
const noble = require("noble");
const http = require("http");
winston.level = process.env.LOG_LEVEL || "debug";

// Project
const fluffaction = require("./fluffaction");
const fluffcon = require("./fluffcon");
const Furby = require("./furby");

// List of connected Furbies
let furbies = {};

/*** HTTP Server ***/
http.createServer(function(req, res) {
		let fragments = req.url.substring(1).split("/");
		let query = fragments.splice(0, 2);
		query.push(fragments.join("/"));

		if (query[0] === "cmd") {
			res.writeHead(200, {"Content-Type": "text/plain", "Access-Control-Allow-Origin": "*"});

			// Answer CORS preflights / unknown requests
			if (req.method === "POST") {
				let commandName = query[1];
				parsePostCommand(commandName, req, res);
			} else {
				res.end();
			}
		} else if (query[0] === "list") {
			res.writeHead(200, {"Content-Type": "text/plain", "Access-Control-Allow-Origin": "*"});
			res.end(JSON.stringify(fluffaction.list()));
		} else if (query[0] === "scan") {
			noble.startScanning(); // TODO: this is for testing
			res.end("scanning");
		} else {
			// empty answer, but with Access-Control-Allow-Origin: *
			res.writeHead(200, {"Content-Type": "text/plain", "Access-Control-Allow-Origin": "*"});
			res.end();
		}
	})
	.listen(3872);

function parsePostCommand(commandName, req, res) {
	let commandDataString = "";
	req.on("data", function(data) {
		commandDataString += data;
	});

	req.on("end", function() {
		let commandData;
		try {
			commandData = JSON.parse(commandDataString);
			if ("target" in commandData) {
				winston.log("verbose", "Sending " + commandName + " command to single Furby " + commandData.target + ", params: " + commandData.params);

				const furbyId = commandData.target;
				if (furbyId in furbies) {
					furbies[furbyId].do(commandName, commandData.params);
				} else {
					winston.log("warn", "could not find target");
					res.end("error: could not find target");
				}
			} else {
				// Send command to a single one of the connected furbies
				// Multiple furbies: Collect results from all furbies and respond
				winston.log("verbose", "Sending " + commandName + " command to all Furbies, params:", commandData.params);
				for (let furbyId in furbies) {
					furbies[furbyId].do(commandName, commandData.params);
				}
			}
			res.end("ok");
		} catch (e) {
			winston.log("warn", "Could not parse HTTP command: " + e);
			res.end("error: " + e);
		}
	});
}


/*** noBLE Callbacks ***/
noble.on("stateChange", function(state) {
	if (state === "poweredOn") {
		noble.startScanning();
	} else {
		noble.stopScanning();
	}
});

noble.on("discover", function(peripheral) {
	if (peripheral.advertisement.localName === "Furby") {
		winston.log("info", "Discovered Furby: " + peripheral.uuid);

		// Introspection mode
		if (process.argv[2] === "introspect") {
			fluffcon.introspect(peripheral);
			return;
		}

		// Normal server mode
		fluffcon.connect(peripheral, function (fluff) {
			const furby = new Furby(peripheral.uuid, fluff);
			furby.learn(fluffaction.commands);
			furbies[peripheral.uuid] = furby;
		});
	}
});
