node-red-contrib-aws
========================
A collection of <a href="http://nodered.org" target="_new">Node-RED</a> nodes for <a href="https://zdrive.ir" target="_new">Monster</a>.

Nodes (All Monster API functions are available)
-----------------

* S3
* Monster config

Feature requests are welcome, submit an issue at https://opengit.ir/nodered/node-red-contrib-monster.git

Usage
---
Parameters need to be specified as per the AWS API (typically LeadingUpperCase).

if msg.MonsterConfig is set, it will override the node configuration.  This allows you to use the same node/flow with different accounts.
For example
	msg.MonsterConfig={
		endpoint: "ENDPOINT",
		projectId: "PROJECT ID",
		accessKeyId: "ACCESS KEY",
		secretAccessKey:"SECRET KEY",
		region:"Region"
	}



WARNING
----
Only cursory testing of nodes has occured at this stage, please test and report issues.

Acknowledgements
----------------

The node-red-contrib-monster uses the following open source software:

- [AWS SDK for JavaScript] (https://github.com/aws/aws-sdk-js): AWS SDK for JavaScript in the browser and Node.js.

License
-------

See [license] (https://opengit.ir/nodered/node-red-contrib-monster/blob/main/LICENSE) (Apache License Version 2.0).

Contributions
----

Enjoy.