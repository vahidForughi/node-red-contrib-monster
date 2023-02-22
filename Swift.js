
/**
 * Copyright 2021 Daniel Thomas.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
	"use strict";

	const Swift = require("openstack-swift-client");
	const path = require("path");
	const fs = require("fs");

	function MonsterAPINode(n) {
		RED.nodes.createNode(this,n);
		this.monsterConfig = RED.nodes.getNode(n.monster);
		this.endpoint = n.endpoint;
		this.region = n.region;
		this.operation = n.operation;
		this.name = n.name;
		// this.endpoint = this.monsterConfig.endpoint;
		// this.region = this.monsterConfig.region;
		// this.projectId = this.monsterConfig.projectId;
		// this.accessKey = this.monsterConfig.accessKey;
		// this.secretKey = this.monsterConfig.secretKey;

    var node = this;
		var Swift = require("openstack-swift-client");

		const genCredential = function(config) {
			return [
				config.endpoint+'/auth/v1.0/',
				config.projectId + ':' + config.accessKey,
				config.secretKey
			]
		}
		const authenticator = new Swift.SwiftAuthenticator(...genCredential(this.monsterConfig));
		let swift = new Swift(authenticator);
		
		if (!swift) {
			node.warn("Missing Swift credentials");
			return;
		}

		
		node.on("input", async function(msg) {
			// node.send([{n:n ,msg: msg},null]);
			var aService = msg.MonsterConfig?new Swift(...genCredential(msg.MonsterConfig)) : swift;

			node.sendMsg = function (err, data, msg) {
				if (err) {
				    node.status({fill:"red",shape:"ring",text:"error"});
					node.error("failed: " + err.toString(), msg);
					node.send([null, { err: err }]);
					return;
				} else {
					if (msg)
						msg.payload = data;
					node.status({});
				}
				node.send([msg,null]);
			};

			if (typeof service[node.operation] == "function"){
				node.status({fill:"blue",shape:"dot",text:node.operation});
				const req = await service[node.operation](aService,msg,function(err,data){
					// node.sendMsg(err, data, msg);
				});
        		// node.sendMsg(req)
				node.send([{res: req},null]);

			} else {
				node.error("failed: Operation node defined - "+node.operation);
			}
		});

		var copyArg = function(src,arg,out,outArg,isObject){
			var tmpValue = src[arg];
			outArg = (typeof outArg !== 'undefined') ? outArg : arg;

			if (typeof src[arg] !== 'undefined'){
				if (isObject && typeof src[arg]=="string" && src[arg] != "") {
					tmpValue=JSON.parse(src[arg]);
				}
				out[outArg] = tmpValue;
			}
			//Monster API takes 'Payload' not 'payload' (see Lambda)
			if (arg=="Payload" && typeof tmpValue == 'undefined'){
					out[arg]=src["payload"];
			}
		}

		const getFullFilename = function(filename) {
			var fullFilename = filename ? filename : "";
			if (filename && RED.settings.fileWorkingDirectory && !path.isAbsolute(filename)) {
				fullFilename = path.resolve(path.join(RED.settings.fileWorkingDirectory,"/"+ filename));
			}
			return fullFilename
		}

		var service = {};


		service.ServerInfo=async function(svc,msg,cb){
			var params={};
			return await svc.info()
		}


		service.ListContainers=async function(svc,msg,cb){
			var params={};
			return await svc.list()
		}

		service.CreateContainer=async function(svc,msg,cb){
			var params={};
			copyArg(n,"Container",params,undefined,false);
			// copyArg(n,"Public",params,undefined,false);
			// copyArg(n,"Metadata",params,undefined,false);
			copyArg(msg,"Container",params,undefined,false);
			copyArg(msg,"Public",params,undefined,false);
			copyArg(msg,"Metadata",params,undefined,false);
			return await svc.create(params["Container"], params["Public"]?params["Public"]:true, params["Metadata"]);
		}

		service.UpdateContainerMeta=async function(svc,msg,cb){
			var params={};
			copyArg(n,"Container",params,undefined,false);
			// copyArg(n,"Metadata",params,undefined,false);
			// copyArg(n,"Public",params,undefined,false);
			copyArg(msg,"Container",params,undefined,false);
			copyArg(msg,"Metadata",params,undefined,false);
			return await svc.update(params["Container"], params["Metadata"]);
		}

		service.DeleteContainer=async function(svc,msg,cb){
			var params={};
			copyArg(n,"Container",params,undefined,false);
			copyArg(msg,"Container",params,undefined,false);
			return await svc.delete(params["Container"]);
		}

		service.GetContainerMeta=async function(svc,msg,cb) {
			var params = {};
			copyArg(n, "Container", params, undefined, false);
			copyArg(msg, "Container", params, undefined, false);
			return await svc.meta(params["Container"]);
		}

		service.GetContainerMeta=async function(svc,msg,cb){
			var params={};
			copyArg(n,"Container",params,undefined,false);
			copyArg(msg,"Container",params,undefined,false);
			return await svc.meta(params["Container"]);
		}

		service.HeadContainer=async function(svc,msg,cb){
			var params={};
			copyArg(n,"Container",params,undefined,false);
			copyArg(msg,"Container",params,undefined,false);
			// return await svc.head(params["Container"]);
		}


		service.ListObjects=async function(svc,msg,cb){
			var params={};
			copyArg(n,"Container",params,undefined,false);
			copyArg(msg,"Container",params,undefined,false);
			copyArg(msg,"Delimiter",params,undefined,false);
			copyArg(msg,"EncodingType",params,undefined,false);
			copyArg(msg,"Marker",params,undefined,false);
			copyArg(msg,"MaxKeys",params,undefined,false);
			copyArg(msg,"Prefix",params,undefined,false);
			copyArg(msg,"RequestPayer",params,undefined,false);
			copyArg(msg,"ExpectedContainerOwner",params,undefined,false);
			return await svc.container(params["Container"]).list();
		}

		service.GetObject=async function(svc,msg,cb){
			var params={};
			copyArg(n,"Container",params,undefined,false);
			copyArg(n,"Key",params,undefined,false);
			copyArg(n,"Filename",params,undefined,false);
			copyArg(msg,"Container",params,undefined,false);
			copyArg(msg,"Key",params,undefined,false);
			copyArg(msg,"Filename",params,undefined,false);
			return await svc.container(params["Container"]).get(
				params["Key"],
				fs.createWriteStream(getFullFilename(params["Filename"]))
			);
		}

		service.PutObject=async function(svc,msg,cb){
			var params={};
			copyArg(n,"Container",params,undefined,false);
			copyArg(n,"Key",params,undefined,false);
			copyArg(n,"Filename",params,undefined,false);
			copyArg(msg,"Container",params,undefined,false);
			copyArg(msg,"Key",params,undefined,false);
			copyArg(msg,"Body",params,undefined,false);
			copyArg(msg,"Metadata",params,undefined,true);
			copyArg(msg,"Filename",params,undefined,false);
			return await svc.container(params["Container"]).create(
				params["Key"],
				fs.createReadStream(getFullFilename(params["Filename"])),
				params["Metadata"]
			);
		}

		service.UpdateObjectMeta=async function(svc,msg,cb){
			var params={};
			copyArg(n,"Container",params,undefined,false);
			copyArg(n,"Key",params,undefined,false);
			copyArg(msg,"Container",params,undefined,false);
			copyArg(msg,"Key",params,undefined,false);
			copyArg(msg,"Metadata",params,undefined,true);
			return await svc.container(params["Container"]).update(params["Key"],params["Metadata"]);
		}

		service.DeleteObject=async function(svc,msg,cb) {
			var params = {};
			copyArg(n, "Container", params, undefined, false);
			copyArg(n, "Key", params, undefined, false);
			// copyArg(n,"Wait",params,undefined,false);
			copyArg(msg, "Container", params, undefined, false);
			copyArg(msg, "Key", params, undefined, false);
			copyArg(msg, "Wait", params, undefined, false);
			return await svc.container(params["Container"]).delete(params["Key"], params["Wait"] ? params["Wait"] : 0);
		}

		service.GetObjectMeta=async function(svc,msg,cb){
			var params={};
			copyArg(n,"Container",params,undefined,false);
			copyArg(n,"Key",params,undefined,false);
			copyArg(msg,"Container",params,undefined,false);
			copyArg(msg,"Key",params,undefined,false);
			return await svc.container(params["Container"]).meta(params["Key"]);
		}

		service.HeadObject=function(svc,msg,cb){
			var params={};
			copyArg(n,"Container",params,undefined,false);
			copyArg(n,"Key",params,undefined,false);
			copyArg(msg,"Container",params,undefined,false);
			copyArg(msg,"Key",params,undefined,false);
			// svc.headObject(params,cb);
		}

	}
	RED.nodes.registerType("Monster Swift", MonsterAPINode);

};
