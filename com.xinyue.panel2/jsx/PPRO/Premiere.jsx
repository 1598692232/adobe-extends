$._fio_PPRO_index = {}; // cache of all projectItems
$._fio_PPRO_encoder_jobs = {}; // stores ongoing renderjobs and their data

$._PPRO_ = {
      getVersion:function () {
            return 'v1';
      },
    
	setPoint: function (frame) {
		var active_seq = app.project.activeSequence;
		if (active_seq == null || active_seq == undefined) return;
		ticks = active_seq.timebase * frame;
		active_seq.setPlayerPosition((ticks >= 0) ? ticks : 0);
     },

	setPointForPlaying: function(ticks){
        var active_seq = app.project.activeSequence;
		if (!active_seq) return;
         active_seq.setPlayerPosition((ticks >= 0) ? ticks : 0);
	},

    getTimeBase: function(){
        var active_seq = app.project.activeSequence;
        if (active_seq == null || active_seq == undefined) return;
        return active_seq.timebase;
    },

    startLaunchEncoder: function() {
        app.encoder.launchEncoder()
    },

	
	xy_render_active_sequence: function(data) {
			$.writeln('xy_render_active_sequence')
		if (!data) return;
		//$.writeln("---");
		//$.writeln(data.uid); //
		//$.writeln(data.auto_version === 1);
        //$.writeln(data.export_marker === 1);
		 //$.writeln(data.keep_file === 1);
		 //$.writeln(data.preset_path); //
		//$.writeln(data.render_path); //
		 //$.writeln(data.render_range); //
		// $.writeln("---");

		app.enableQE();
		var active_seq = qe.project.getActiveSequence();
		if (!active_seq) {
			alert("No active sequence.");
			return null;
		}
        app.encoder.launchEncoder()

		var jobData = {};
		jobData.seq_name = encodeURIComponent(active_seq.name);
		jobData.seq_id = active_seq.guid;
		jobData.keep_file = data.keep_file;
		jobData.auto_version = data.auto_version;

		var renderRange = app.encoder[data.render_range] || app.encoder.ENCODE_ENTIRE;
		var range = this.xy_get_active_sequence_range(renderRange)
		jobData.seq_in = range.start;
		
		// MARKER
		if(data.export_marker === 1){
			var markers = this.xy_get_active_sequence_markers(range.start, range.end);
			if(markers) jobData.marker = markers;
		}

		var out_path 	= new File(data.render_path);
		var out_preset 	= new File(data.preset_path);
		var sep = (qe.platform == 'Macintosh') ? '/' : '\\';

		var active_seq_name = active_seq.name;
		active_seq_name = active_seq_name.replace("\\","-");
		active_seq_name = active_seq_name.replace("/","-");
		active_seq_name = active_seq_name.replace(":","-");

		var extension = active_seq.getExportFileExtension(out_preset.fsName);
		var filename_plus_extension = active_seq_name + "." + extension;
		var full_path_to_file = out_path.fsName + sep + active_seq_name + "." + extension;

		app.encoder.bind('onEncoderJobComplete', $._PPRO_.onEncoderJobComplete);
		app.encoder.bind('onEncoderJobError', $._PPRO_.onEncoderJobError);
		app.encoder.bind('onEncoderJobProgress', $._PPRO_.onEncoderJobProgress);
		app.encoder.bind('onEncoderJobQueued', $._PPRO_.onEncoderJobQueued);

		// use these 0 or 1 settings to disable some/all metadata creation.
		app.encoder.setEmbeddedXMPEnabled(0);
		//$.writeln(app.project.activeSequence,full_path_to_file,  out_preset.fsName,renderRange)
		var jobID = app.encoder.encodeSequence(app.project.activeSequence, full_path_to_file, out_preset.fsName, renderRange);
		$._fio_PPRO_encoder_jobs[jobID] = jobData;

		out_path.close();
		out_preset.close();
		return jobID;
		
	},
	
	xy_get_active_sequence_range: function(rangeKey) {
			$.writeln('xy_get_active_sequence_range')
		if (typeof(rangeKey) !== 'number') { rangeKey = app.encoder.ENCODE_ENTIRE; }
		var sequence = app.project.activeSequence;
        //$.writeln( typeof(sequence) !== 'object' )
		if (typeof(sequence) !== 'object') { return {start: 0.0, end: 400000}; }
	
		// range in seconds
		var sequenceIn = sequence.getInPoint();
		var sequenceOut = sequence.getOutPoint();
	
		if (rangeKey === app.encoder.ENCODE_WORKAREA) {
			app.enableQE();
			var qeSequence = qe.project.getActiveSequence();
			if (qeSequence) {
				sequenceIn = qeSequence.workInPoint.secs;
				sequenceOut = qeSequence.workOutPoint.secs;
			}
		}
	
		if (sequenceIn < 0.0 || rangeKey === app.encoder.ENCODE_ENTIRE) sequenceIn = 0.0; // if no in-point is set it´s -40000
		if (sequenceOut < 0.0 || rangeKey === app.encoder.ENCODE_ENTIRE) sequenceOut = 400000;
		return {start: sequenceIn, end: sequenceOut};
	},


	
	xy_get_active_sequence_markers: function (sequenceIn, sequenceOut) {
		$.writeln('xy_get_active_sequence_markers')
		if (!sequenceIn) {
			var range = $._PPRO_.xy_get_active_sequence_range()
			sequenceIn = range.start;
			sequenceOut = range.end;
		}
		var sequence = app.project.activeSequence;
		if (typeof(sequence) !== 'object') { return null; }

		// collect markers in the sequence range
		var markers = sequence.markers; // create Markercollection
		if (typeof(markers) !== 'object' || markers.numMarkers < 1) return null;
		var collectedMarkers = [];
		
		var marker = markers.getFirstMarker();
		while (typeof(marker) === 'object'){
			// skip non-Comment markers or marker outside the range
			if (marker.type != "Comment" || marker.start.seconds < sequenceIn || marker.start.seconds > sequenceOut){
				marker = markers.getNextMarker(marker);
				continue;
			}
			collectedMarkers.push(marker);
			marker = markers.getNextMarker(marker);
		}
		
		// create stringyfied marker objects
		var frameLength = sequence.timebase / 254016000000;
		var collectedMarkersCount = collectedMarkers.length;
		var UIDs = [];
		while (UIDs.length < collectedMarkersCount) UIDs.push(this.xy_get_alpha_num_uid(6));
		var markerObjectStrings = [];

		for (var i = 0; i < collectedMarkersCount; i++) {
			var collectedMarker = collectedMarkers[i];

			// add uid to marker name for later identification
			var noFrameioUID = true;
			var uid = UIDs[i];
			var test = collectedMarker.name.match(/\[#(.*?)\]/); // check if marker already has a FIO id
			if (test != null && test.length > 0) {
				uid = test[1];
				noFrameioUID = false;
			}

			// create the marker object string
			var marker_time = (collectedMarker.start.seconds - sequenceIn) / frameLength; // seconds to frames
			var str = '{';
			str += '"timestamp": "' + marker_time + '", ';
			str += '"text": "' + encodeURIComponent(collectedMarker.comments) + '", ';
			str += '"frontend_id": "' + uid;
			str += '"}';
			markerObjectStrings.push(str);

			// add uid to marker for later syncing
			if (noFrameioUID) {
				collectedMarker.name += " [#" + uid + "]";
			}
		}
		return encodeURIComponent('[' + markerObjectStrings.join(",") + ']');
	},


    onEncoderJobComplete: function(jobID, outputFilePath) {
		$.writeln('onEncoderJobComplete')
		app.enableQE();
		var eoName = "lib:\PlugPlugExternalObject.dll";
		if (qe.platform == 'Macintosh') eoName = "lib:\PlugPlugExternalObject";
		var mylib 	 = new ExternalObject(eoName);
		var eventObj = new CSXSEvent();
		//  $.writeln($._fio_PPRO_encoder_jobs, '$._fio_PPRO_encoder_jobs', jobID)
		if (jobID in $._fio_PPRO_encoder_jobs){
         
			$._fio_PPRO_encoder_jobs[jobID]["status"] = "COMPLETE";
			$._fio_PPRO_encoder_jobs[jobID]["file_path"] = encodeURIComponent(outputFilePath);
			$._fio_PPRO_encoder_jobs[jobID]["platform"] = qe.platform == "Macintosh" ? "mac" : "win";
			var props = [];
			for (var key in $._fio_PPRO_encoder_jobs[jobID]){
				var value = $._fio_PPRO_encoder_jobs[jobID][key];
				if (typeof(value) === 'function') continue;
				if (key == "keep_file" || key == "auto_version")
					props.push( '"'+key+'":'+value.toString());
				else props.push( '"'+key+'":"'+value.toString()+'"' );
			}
			eventObj.data = '{'+ props.join(",") +'}';
            //$.writeln(jobID)
			eventObj.type = "xinyue.events.RenderEvent."+jobID;
            
			eventObj.dispatch();
			delete $._fio_PPRO_encoder_jobs[jobID];
		}
	},

	onEncoderJobError: function(jobID,error_msg) {
		$.writeln('onEncoderJobError');
		app.enableQE();
		var eoName = "lib:\PlugPlugExternalObject.dll";
		if (qe.platform == 'Macintosh') eoName = "lib:\PlugPlugExternalObject";
		var mylib 	 = new ExternalObject(eoName);
		var eventObj = new CSXSEvent();
		eventObj.type = "xinyue.events.RenderEvent."+jobID;
		eventObj.data = '{"status":"ERROR","message":"'+error_msg+'"}';
		eventObj.dispatch();
	},

	onEncoderJobProgress: function(jobID, progress) {
		//$.writeln('onEncoderJobProgress', progress)
		app.enableQE();
		var eoName = "lib:\PlugPlugExternalObject.dll";
		if (qe.platform == 'Macintosh') eoName = "lib:\PlugPlugExternalObject";
		var mylib 	 = new ExternalObject(eoName);
		var eventObj = new CSXSEvent();
		eventObj.type = "xinyue.events.RenderProgressEvent."+jobID;
		eventObj.data = progress;
		eventObj.dispatch();
	},

	onEncoderJobQueued: function(jobID) {
		$.writeln('onEncoderJobQueued')
		app.encoder.startBatch();
	},

	
	xy_get_alpha_num_uid: function (num_char) {
		$.writeln('xy_get_alpha_num_uid')
		var index = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
		var result = "";
		while(result.length < (num_char+1)){
			result += index.charAt(Math.floor(Math.random() * index.length));
		}
		return result;
	},


	//上传的素材
	xy_get_bins_at_root: function () {
		$.writeln('fio_get_bins_at_root')
		var num = app.project.rootItem.children.numItems;
		var result = ['{"address":"root","name_encoded":"'+encodeURIComponent("PROJECT ROOT")+'"}'];
		for (var i=0; i<num;i++){
			var item = app.project.rootItem.children[i];
			if (item.type == ProjectItemType.BIN){
				var obj = '{"address":"root:'+i.toString()+'","name_encoded":"'+encodeURIComponent(item.name)+'"}';
				result.push(obj);
			}
		}
		$.writeln('['+result.join(",")+']', 9999999)
		return '['+result.join(",")+']'; // stringify Array
	},

	xy_get_contents_of_bin: function (address) {
		$.writeln('fio_get_contents_of_bin', address)
		var biny;
		if (address === "root") biny  = app.project.rootItem;
		else biny = app.project.rootItem.children[parseInt(address.split(":")[1])];
		if (biny == undefined || biny == null) return;
		var result = [];
		var traverse = function (proj_item,address_idx){
			var UIDs = [];
			var len = proj_item.children.numItems;
			// first create unique ids, so we don´t have to create them in the 2nd loop,
			// which would result in always having the same uid
			for (var u=0; u<len; u++) UIDs.push($._PPRO_.xy_get_alpha_num_uid(6));
			for (var i=0; i<len; i++){
				var item = proj_item.children[i];
				if (!item) continue;
				var current_address = address_idx+':'+i.toString();
				if (item.type == ProjectItemType.CLIP || item.type == ProjectItemType.FILE){
					var media_path = item.getMediaPath();
					if (media_path.length < 2) continue; // discard generated clip
					var obj = '{';
					obj += '"type":"file",';
					obj += '"path":"'+encodeURIComponent(media_path)+'",';
					obj += '"address":"'+current_address+'",';
					obj += '"parent_bin_name":"'+encodeURIComponent(proj_item.name)+'",';
					obj += '"parent_bin_address":"'+address_idx+'"';
					obj += '}';
					result.push(obj);
				}
				if (item.type == ProjectItemType.BIN){
					var obj = '{';
					obj += '"type":"bin",';
					obj += '"address":"'+current_address+'",';
					obj += '"name":"'+encodeURIComponent(item.name)+'",';
					obj += '"parent_bin_name":"'+encodeURIComponent(proj_item.name)+'",';
					obj += '"parent_bin_address":"'+address_idx+'"';
					obj += '}';
					result.push(obj);
					traverse(item,current_address);
				}
			}
		}
		var root_bin = '{';
		root_bin += '"type":"bin",';
		root_bin += '"address":"'+address+'",';
		root_bin += '"name":"'+encodeURIComponent(biny.name)+'"';
		root_bin += '}';
		result.push(root_bin);
		traverse(biny,address);
		$.writeln(result, 'result')
		return '['+result.join(",")+']'; // stringify Array
	},
   
}