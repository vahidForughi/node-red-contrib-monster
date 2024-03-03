
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

	// const Swift = require("openstack-swift-client");
	const Swift = require("openstack-swift-sdk");
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
		// var Swift = require("openstack-swift-client");
		var Swift = require("openstack-swift-sdk");

		const genCredential = function(config) {
			return [
				// config.endpoint+'/auth/v1.0/',
				config.projectId + ':' + config.accessKey,
				config.secretKey
			]
		}

		// const authenticator = new Swift.SwiftAuthenticator(...genCredential(this.monsterConfig));
		// let swift = new Swift(authenticator);
		let swift = new Swift(this.monsterConfig.endpoint)
    	swift.init(...genCredential(this.monsterConfig));
		
		if (!swift) {
			node.warn("Missing Swift credentials");
			return;
		}
		node.monsterConfig = this.monsterConfig
		
		node.on("input", async function(msg) {
			const initSwift = async function (config) {
				var ser = new Swift(config.endpoint)
				await ser.init(...genCredential(config))
				return ser;
			}
			let monsterConfig = {...node.monsterConfig}
			let initAgain = false			
			
			const globalMonsterConfig = this.context().global.get('MonsterConfig')
			if (globalMonsterConfig) {
				monsterConfig = { ...monsterConfig, ...globalMonsterConfig }
				initAgain = true;
			}

			if (msg.MonsterConfig) {
				monsterConfig = { ...monsterConfig, ...msg.MonsterConfig }
				initAgain = true;
			}

			if (initAgain) {
				aService = await initSwift(monsterConfig)
			} else {
				var aService = swift;
			}
			// node.send([{n:n ,msg: msg, config: node.monsterConfig, swift: swift, aService: aService},null]);

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
				let req = await service[node.operation](aService,msg,function(err,data){
					// node.sendMsg(req)
				});
				
				if (req.status && [200,201,202,203,204].includes(req.status)) {
					node.send([{...msg, payload: req},null]);
				} else if (req.message && (req.message).search("401") >= 0) {
					aService = await initSwift(monsterConfig)
					req = await service[node.operation](aService,msg,function(err,data){});
					node.send([{...msg, payload: req},null]);
				} else {
					node.send([null, {...msg, payload: req}]);
				}

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


		var service = {};


		// service.ServerInfo=async function(svc,msg,cb){
		// 	var params={};
		// 	return await svc.info()
		// }


		service.ListContainers=async function(svc,msg,cb){
			var params={};
			return await svc.accountDetails()
		}

		service.CreateContainer=async function(svc,msg,cb){
			var params={};
			copyArg(n,"Container",params,undefined,false);
			// copyArg(n,"Public",params,undefined,false);
			// copyArg(n,"Metadata",params,undefined,false);
			copyArg(msg,"Container",params,undefined,false);
			// copyArg(msg,"Public",params,undefined,false);
			// copyArg(msg,"Metadata",params,undefined,false);
			return await svc.createContainer(params["Container"]);
		}

		service.UpdateContainerMeta=async function(svc,msg,cb){
			var params={};
			copyArg(n,"Container",params,undefined,false);
			// copyArg(n,"Metadata",params,undefined,false);
			// copyArg(n,"Public",params,undefined,false);
			copyArg(msg,"Container",params,undefined,false);
			copyArg(msg,"Metadata",params,undefined,false);
			return await svc.updateContainerMetadatas(params["Container"], params["Metadata"]);
		}

		service.DeleteContainer=async function(svc,msg,cb){
			var params={};
			copyArg(n,"Container",params,undefined,false);
			copyArg(msg,"Container",params,undefined,false);
			return await svc.removeContainer(params["Container"]);
		}

		service.GetContainerMeta=async function(svc,msg,cb) {
			var params = {};
			copyArg(n, "Container", params, undefined, false);
			copyArg(msg, "Container", params, undefined, false);
			return await svc.getContainerMetadata(params["Container"]);
		}

		// service.GetContainerMeta=async function(svc,msg,cb){
		// 	var params={};
		// 	copyArg(n,"Container",params,undefined,false);
		// 	copyArg(msg,"Container",params,undefined,false);
		// 	return await svc.meta(params["Container"]);
		// }

		// service.HeadContainer=async function(svc,msg,cb){
		// 	var params={};
		// 	copyArg(n,"Container",params,undefined,false);
		// 	copyArg(msg,"Container",params,undefined,false);
		// 	// return await svc.head(params["Container"]);
		// }


		service.ListObjects=async function(svc,msg,cb){
			var params={};
			copyArg(n,"Container",params,undefined,false);
			copyArg(msg,"Container",params,undefined,false);
			copyArg(msg,"ContentType",params,undefined,false);
			copyArg(msg,"Delimiter",params,undefined,false);
			// copyArg(msg,"EncodingType",params,undefined,false);
			// copyArg(msg,"Marker",params,undefined,false);
			// copyArg(msg,"MaxKeys",params,undefined,false);
			copyArg(msg,"Prefix",params,undefined,false);
			// copyArg(msg,"RequestPayer",params,undefined,false);
			// copyArg(msg,"ExpectedContainerOwner",params,undefined,false);
			return await svc.getContainerObjectDetails(params["Container"],params["ContentType"],params["Delimiter"],params["Prefix"]);
		}

		service.GetObject=async function(svc,msg,cb){
			var params={};
			copyArg(n,"Container",params,undefined,false);
			copyArg(n,"Object",params,undefined,false);
			// copyArg(n,"Filename",params,undefined,false);
			copyArg(msg,"Container",params,undefined,false);
			copyArg(msg,"Object",params,undefined,false);
			// copyArg(msg,"Filename",params,undefined,false);
			const res = await svc.getObjectContent(params["Container"],params["Object"]);
			if (typeof res.message === 'object' && typeof res.message.on === 'function') {
				return new Promise((resolve, reject) => {
					const stream = res.message;
					res.message = '';
					var result = []
					stream.on('data', data => {
						result.push(Buffer.from(data))
					});
					stream.on('end', () => {
						resolve({...res, message: Buffer.concat(result)})
					});
				});
			}
			else {
				return res
			}
		}

		service.PutObject=async function(svc,msg,cb){
			var params={};
			copyArg(n,"Container",params,undefined,false);
			copyArg(n,"Object",params,undefined,false);
			// copyArg(n,"Filename",params,undefined,false);
			copyArg(msg,"Container",params,undefined,false);
			copyArg(msg,"Object",params,undefined,false);
			copyArg(msg,"Body",params,undefined,false);
			// copyArg(msg,"Metadata",params,undefined,true);
			// copyArg(msg,"Filename",params,undefined,false);
			return await svc.createObject(params["Container"],params["Object"],params["Body"]);
		}

		service.CopyObject=async function(svc,msg,cb){
			var params={};
			copyArg(n,"Source",params,undefined,false);
			copyArg(n,"Destination",params,undefined,false);
			copyArg(msg,"Object",params,undefined,false);
			copyArg(msg,"Destination",params,undefined,false);
			return await svc.copyObject(params["Object"],params["Destination"]);
		}

		service.UpdateObjectMeta=async function(svc,msg,cb){
			var params={};
			copyArg(n,"Container",params,undefined,false);
			copyArg(n,"Object",params,undefined,false);
			copyArg(msg,"Container",params,undefined,false);
			copyArg(msg,"Object",params,undefined,false);
			copyArg(msg,"Metadata",params,undefined,true);
			return await svc.updateObjectMetadata(params["Container"],params["Object"],params["Metadata"]);
		}

		service.DeleteObject=async function(svc,msg,cb) {
			var params = {};
			copyArg(n, "Container", params, undefined, false);
			copyArg(n, "Object", params, undefined, false);
			// copyArg(n,"Wait",params,undefined,false);
			copyArg(msg, "Container", params, undefined, false);
			copyArg(msg, "Object", params, undefined, false);
			// copyArg(msg, "Wait", params, undefined, false);
			return await svc.removeObject(params["Container"],params["Object"]);
		}

		service.GetObjectMeta=async function(svc,msg,cb){
			var params={};
			copyArg(n,"Container",params,undefined,false);
			copyArg(n,"Object",params,undefined,false);
			copyArg(msg,"Container",params,undefined,false);
			copyArg(msg,"Object",params,undefined,false);
			return await svc.getObjectMetadata(params["Container"],params["Object"]);
		}

		// service.HeadObject=function(svc,msg,cb){
		// 	var params={};
		// 	copyArg(n,"Container",params,undefined,false);
		// 	copyArg(n,"Object",params,undefined,false);
		// 	copyArg(msg,"Container",params,undefined,false);
		// 	copyArg(msg,"Object",params,undefined,false);
		// 	// svc.headObject(params,cb);
		// }

	}
	RED.nodes.registerType("Monster Swift", MonsterAPINode);

};
