String.prototype.splice = function(idx, s){ return (this.slice(0,idx) + s + this.slice(idx)); };
String.prototype.splicen = function(idx, s, n){ return (this.slice(0,idx) + s + this.slice(idx+n));};
String.prototype.search_at = function(idx, s){ return (this.substring(idx-s.length,idx) == s); };

var Guppy = function(guppy_div, properties){
    var self = this;
    properties = properties || {};
    if(typeof guppy_div === 'string' || guppy_div instanceof String){
	guppy_div = document.getElementById(guppy_div);
    }
    
    // Set the id on the div if it is not currently set.
    if(!(guppy_div.id)){
	Guppy.log("no id");
	var i = Guppy.max_uid || 0;
	Guppy.log("III",i);
	while(document.getElementById("guppy_uid_"+i)) i++;
	Guppy.max_uid = i;
	guppy_div.id = "guppy_uid_"+i;
    }
    var i = Guppy.max_tabIndex || 0;
    guppy_div.tabIndex = i;
    Guppy.max_tabIndex = i+1;
    
    
    this.editor_active = true;
    this.debug_mode = false;
    this.editor = guppy_div;
    this.type_blacklist = [];
    this.done_callback = this;
    this.ready = false;
    
    if('xml_content' in properties){
	this.base = (new window.DOMParser()).parseFromString(properties.xml_content, "text/xml");
    }
    else {
	this.base = (new window.DOMParser()).parseFromString("<m><e></e></m>", "text/xml");
    }
    
    if('blacklist' in properties)
	this.type_blacklist = properties.blacklist;

    if('done_callback' in properties)
	this.done_callback = properties.done_callback;
    
    if('ready_callback' in properties)
	this.ready_callback = properties.ready_callback;
    
    if('debug' in properties)
	this.debug_mode = properties.debug=="yes" ? true : false;

    
    Guppy.instances[guppy_div.id] = this;
    
    if(Guppy.ready && !this.ready){
	if(this.ready_callback) this.ready_callback();
	this.ready = true;
    }
    Guppy.log("ACTIVE",Guppy.active_guppy);
    this.deactivate();
    this.clipboard = null;
    this.current = this.base.documentElement.firstChild;
    if(!this.current.firstChild) this.current.appendChild(this.base.createTextNode(""));
    this.caret = 0;
    this.sel_start = null;
    this.sel_end = null;
    this.undo_data = [];
    this.undo_now = -1;
    this.sel_status = Guppy.SEL_NONE;
    this.checkpoint();
    this.editor.addEventListener("keydown",Guppy.key_down, false);
    this.editor.addEventListener("keyup",Guppy.key_up, false);
    this.editor.addEventListener("focus", function(e) { Guppy.kb.alt_down = false; if(self.activate) self.activate();}, false);
    this.editor.style.boxShadow = "1px 1px 1px 0 lightgray inset";
}

/* Functions intended for external use */

Guppy.guppy_init = function(xslpath, sympath){
    Guppy.get_latexify(xslpath);
    Guppy.get_symbols(sympath, function(){
	Guppy.ready = true;
	for(var i in Guppy.instances){
	    Guppy.instances[i].render();
	    if(Guppy.instances[i].ready_callback){
		Guppy.instances[i].ready = true;
		Guppy.instances[i].ready_callback();
	    }
	}
    });
    Guppy.symb_raw("*","\\cdot ","*");
    Guppy.symb_raw("pi","{\\pi}"," PI ");
    Guppy.symb_func("sin");
    Guppy.symb_func("cos");
    Guppy.symb_func("tan");
    Guppy.symb_func("sec");
    Guppy.symb_func("csc");
    Guppy.symb_func("cot");
    Guppy.symb_func("log");
    Guppy.symb_func("ln");

}

Guppy.prototype.get_content = function(t){
    if(t != "xml") return Guppy.xsltify(t,this.base);
    else return (new XMLSerializer()).serializeToString(this.base);
}

Guppy.prototype.set_content = function(xml_data){
    this.base = (new window.DOMParser()).parseFromString(xml_data, "text/xml");
    this.clipboard = null;
    var l = this.base.getElementsByTagName("e");
    Guppy.log(l);
    for(var i = 0; i < l.length; i++){
	if(!(l[i].firstChild)) l[i].appendChild(this.base.createTextNode(""));
    }
    this.current = this.base.documentElement.firstChild;
    this.caret = 0;
    this.sel_start = null;
    this.sel_end = null;
    this.undo_data = [];
    this.undo_now = -1;
    this.sel_status = Guppy.SEL_NONE;
    this.checkpoint();
}


Guppy.instances = {};
Guppy.ready = false;

/* -------------------- */

Guppy.active_guppy = null;
Guppy.xsltProcessor = null;

Guppy.SEL_NONE = 0;
Guppy.SEL_CURSOR_AT_START = 1;
Guppy.SEL_CURSOR_AT_END = 2;

Guppy.is_blank = function(n){
    return n.firstChild == null || n.firstChild.nodeValue == '';
}

Guppy.get_symbols = function(symbols_path, callback){
    var req = new XMLHttpRequest();
    req.onload = function(){
	var syms = JSON.parse(this.responseText);
	for(var s in syms){
	    Guppy.kb.symbols[s] = syms[s];
	}
	if(callback){ callback(); }
    };
    req.open("get", symbols_path, true);
    req.send();
}

Guppy.get_latexify = function(xsl_path, callback){
    var req = new XMLHttpRequest();
    req.onload = function(){
	var latexify = this.responseText;
	var latexsl = (new window.DOMParser()).parseFromString(latexify, "text/xml");
	Guppy.xsltProcessor = new XSLTProcessor();
	Guppy.xsltProcessor.importStylesheet(latexsl);
	Guppy.xsltProcessor.setParameter("","blank",Guppy.kb.BLANK);
	Guppy.xsltProcessor.setParameter("","cblank",Guppy.kb.CURRENT_BLANK);
	if(callback){ callback(); }
    };
    req.open("get", xsl_path, true);
    req.send();
}

Guppy.xsltify = function(t, base){
    if(Guppy.xsltProcessor == null){
	Guppy.log("not ready");
	return;
    }
    Guppy.log("BB",base);
    Guppy.xsltProcessor.setParameter("","type",t);
    var tex_doc = Guppy.xsltProcessor.transformToDocument(base);
    Guppy.log(tex_doc);
    return (new XMLSerializer()).serializeToString(tex_doc).replace(/\<.?m\>/g,"");
}

Guppy.mouse_down = function(e){
    var n = e.target;
    if(e.target == document.getElementById("toggle_ref")) toggle_div("help_card");
    else while(n != null){
	if(n.id in Guppy.instances){
	    Guppy.active_guppy = Guppy.instances[n.id];
	    Guppy.active_guppy.activate();
	    for(var i in Guppy.instances){
		if(i != n.id) Guppy.instances[i].deactivate();
	    }
	    return;
	}
	n = n.parentNode;
    }
    Guppy.active_guppy = null;
    for(var i in Guppy.instances){
	Guppy.instances[i].deactivate();
    }
}

window.addEventListener("mousedown",Guppy.mouse_down, false);


Guppy.prototype.render_node = function(n,t){

    // All the interesting work is done by xsltify and latexify.xsl.  This function just adds in the cursor and selection-start cursor
    
    Guppy.log("cc",this.caret,"=caret",this.current,this.current.firstChild.nodeValue.slice(0,this.caret),"bb",this.current.firstChild.nodeValue.slice(this.caret+Guppy.kb.CARET.length));
    var output = "";
    if(t == "latex"){
	var cleanup = [];
	var sel_cursor;
	if(this.sel_status == Guppy.SEL_CURSOR_AT_START) sel_cursor = this.sel_end;
	if(this.sel_status == Guppy.SEL_CURSOR_AT_END) sel_cursor = this.sel_start;
	// Add cursor
	this.current.setAttribute("current","yes");
	var callback_current = this.current;
	cleanup.push(function(){callback_current.removeAttribute("current");});
	var caret_text = this.is_small(this.current) ? Guppy.kb.SMALL_CARET : Guppy.kb.CARET;
	if(this.current.firstChild.nodeValue != "" || this.current.previousSibling != null || this.current.nextSibling != null){
	    Guppy.log("CARETISING",this.sel_status);
	    var idx = this.caret;
	    if(this.sel_status == Guppy.SEL_CURSOR_AT_START) caret_text = caret_text + "\\color{"+Guppy.kb.SEL_COLOR+"}{";
	    if(this.sel_status == Guppy.SEL_CURSOR_AT_END) caret_text = "}" + caret_text;
	    //if(this.sel_status == Guppy.SEL_CURSOR_AT_END && sel_cursor.node == current) idx += SEL_CARET.length;
	    var prev_val = this.current.firstChild.nodeValue;
	    Guppy.log("AAAAAAAAAAA",prev_val);
	    callback_current = this.current;
	    cleanup.push(function(){callback_current.firstChild.nodeValue = prev_val;});
	    this.current.firstChild.nodeValue = this.current.firstChild.nodeValue.splice(idx,caret_text);
	    Guppy.log((new XMLSerializer()).serializeToString(this.base));
	    Guppy.log("CP",prev_val);
	}	
	// Add sel_start
	if(this.sel_status != Guppy.SEL_NONE) {
	    var idx = sel_cursor.caret;
	    if(sel_cursor.node == this.current){
		if(this.sel_status == Guppy.SEL_CURSOR_AT_START) idx += caret_text.length;
		Guppy.log("AT_START");
	    }
	    else{
		var prev_val_sel = sel_cursor.node.firstChild.nodeValue;
		cleanup.push(function(){sel_cursor.node.firstChild.nodeValue = prev_val_sel;});
	    }
	    var sel_caret_text = this.is_small(sel_cursor.node) ? Guppy.kb.SMALL_SEL_CARET : Guppy.kb.SEL_CARET;
	    if(this.sel_status == Guppy.SEL_CURSOR_AT_END) sel_caret_text = sel_caret_text + "\\color{"+Guppy.kb.SEL_COLOR+"}{";
	    if(this.sel_status == Guppy.SEL_CURSOR_AT_START) sel_caret_text = "}" + sel_caret_text;
	    Guppy.log("SEL_IDX",idx);
	    sel_cursor.node.firstChild.nodeValue = sel_cursor.node.firstChild.nodeValue.splice(idx,sel_caret_text);
	    Guppy.log((new XMLSerializer()).serializeToString(this.base));

	}
	Guppy.log(cleanup.length);
	// Render: 
	output = Guppy.xsltify(t, this.base);
	
	// clean up all the mess we made:
	for(var i = cleanup.length - 1; i >= 0; i--){ cleanup[i](); }
	Guppy.log("post cleanup", (new XMLSerializer()).serializeToString(this.base));
	this.print_selection();
	Guppy.log("sel_start_end",this.sel_start,this.sel_end);
    }
    else{
	output = Guppy.xsltify(t, this.base);
    }
    //Guppy.log("cc",caret,"=caret",current.firstChild.nodeValue,current.firstChild.nodeValue.slice(0,caret),"bb",current.firstChild.nodeValue.slice(caret+CARET.length));
    //if(t == "latex") current.firstChild.nodeValue = (caret == 0 ? "" : current.firstChild.nodeValue.slice(0,caret))+current.firstChild.nodeValue.slice(caret+CARET.length);
    return output
}

Guppy.prototype.set_sel_start = function(){
    this.sel_start = {"node":this.current, "caret":this.caret};
}

Guppy.prototype.set_sel_end = function(){
    this.sel_end = {"node":this.current, "caret":this.caret};
}

Guppy.prototype.next_sibling = function(n){
    if(n == null) return null;
    var c = n.parentNode.nextSibling;
    while(c != null && c.nodeName != "e") c = c.nextSibling;
    if(c == null) return null
    else return c.firstChild;
}

Guppy.prototype.prev_sibling = function(n){
    if(n == null) return null;
    var c = n.parentNode.previousSibling;
    while(c != null && c.nodeName != "e") c = c.previousSibling;
    if(c == null) return null
    else return c.firstChild;
}

Guppy.prototype.down_from_f = function(){
    var nn = this.current.firstChild;
    while(nn != null && nn.nodeName != 'c') nn = nn.nextSibling;
    if(nn != null){
	//Sanity check:
	if(nn.nodeName != 'c' || nn.firstChild.nodeName != 'e'){
	    this.problem('dff');
	    return;
	}
	this.current = nn.firstChild;
    }
}

Guppy.prototype.down_from_f_to_blank = function(){
    var nn = this.current.firstChild;
    while(nn != null && !(nn.nodeName == 'c' && nn.children.length == 1 && nn.firstChild.firstChild.nodeValue == "")){
	Guppy.log("DFFTB",nn);
	nn = nn.nextSibling;
    }
    if(nn != null){
	//Sanity check:
	if(nn.nodeName != 'c' || nn.firstChild.nodeName != 'e'){
	    this.problem('dfftb');
	    return;
	}
	this.current = nn.firstChild;
    }
    else this.down_from_f();
}

Guppy.prototype.delete_from_f = function(){
    var n = this.current;
    var p = n.parentNode;
    var prev = n.previousSibling;
    var next = n.nextSibling;
    var new_node = this.make_e(prev.firstChild.textContent + next.firstChild.textContent);
    this.current = new_node;
    this.caret = prev.firstChild.textContent.length;
    p.insertBefore(new_node, prev);
    p.removeChild(prev);
    p.removeChild(n);
    p.removeChild(next);
}

Guppy.prototype.next_node_from_e = function(n){
    if(n == null || n.nodeName != 'e') return null;
    // If we have a next sibling f node, use that:
    if(n.nextSibling != null){
	if(n.nextSibling.nodeName != 'f'){
	    this.problem('nnfe3');
	    return null;
	}
	Guppy.log("next");
	var nc = n.nextSibling.firstChild;
	while(nc != null){
	    if(nc.nodeName == 'c')
		//return n.nextSibling; //TEST
		return nc.firstChild;
	    nc = nc.nextSibling
	}
	return n.nextSibling.nextSibling;
    }
    // If not, then we're either at the top level or our parent is a c
    // child of an f node, at which point we should look to see our
    // parent has a next sibling c node: 
    if(n.parentNode.nextSibling != null && n.parentNode.nextSibling.nodeName == 'c'){
	var nn = n.parentNode.nextSibling.firstChild;
	//Another sanity check:
	if(nn.nodeName != 'e'){
	    this.problem('nnfe1');
	    return null
	}
	Guppy.log("parent.next.child")
	return nn;
    }
    // If we're actually at the top level, then do nothing: 
    if(n.parentNode.parentNode == null) return null;
    //Another sanity check: 
    if(n.parentNode.parentNode.nodeName != 'f'){
	this.problem('nnfe2');
	return null;
    }
    return n.parentNode.parentNode.nextSibling;
}

Guppy.prototype.prev_node_from_e = function(n){
    Guppy.log(n.previousSibling);
    if(n == null || n.nodeName != 'e') return null;
    if(n.previousSibling != null){
	if(n.previousSibling.nodeName != 'f'){
	    this.problem('pnfe3');
	    return null;
	}
	var nc = n.previousSibling.lastChild;
	while(nc != null){
	    if(nc.nodeName == 'c')
		// return n.previousSibling; //TEST
		return nc.lastChild;
	    nc = nc.previousSibling
	}
	return n.previousSibling.previousSibling;
    }
    else if(n.parentNode.previousSibling != null && n.parentNode.previousSibling.nodeName == 'c'){
	var nn = n.parentNode.previousSibling.lastChild;
	//Another sanity check:
	if(nn.nodeName != 'e'){
	    this.problem('pnfe1');
	    return null
	}
	return nn;
    }
    else if(n.parentNode.parentNode == null) return null;
    //Another sanity check: 
    if(n.parentNode.parentNode.nodeName != 'f'){
	this.problem('pnfe2');
	return null;
    }
    // return n.parentNode.parentNode; //TEST
    return n.parentNode.parentNode.previousSibling;
}

Guppy.prototype.symbol_to_node = function(sym_name, content){
    // syn_name is a key in the symbols dictionary
    //
    // content is a list of nodes to insert
    
    var s = Guppy.kb.symbols[sym_name];
    var f = this.base.createElement("f");
    if(s['char']) f.setAttribute("c","yes");
    
    var first_ref = -1;
    var refs_count = 0;
    var first;

    // Make the b nodes for rendering each output
    for(var t in s["output"]){
	var b = this.base.createElement("b");
	b.setAttribute("p",t);
	//Guppy.log(s,t,s["output"][t],s["output"][t].length);
	for(var i = 0; i < s["output"][t].length; i++){
	    if(typeof s["output"][t][i] == 'string' || s["output"][t][i] instanceof String){
		var nt = this.base.createTextNode(s["output"][t][i]);
		b.appendChild(nt);
	    }
	    else{
		var nt = this.base.createElement("r");
		nt.setAttribute("ref",s["output"][t][i]);
		//Guppy.log(t,s["output"][t],s["output"][t][i]);
		if(t == 'latex') {
		    if(first_ref == -1) first_ref = s["output"][t][i];
		    refs_count++;
		}
		b.appendChild(nt);
	    }
	}
	f.appendChild(b);
    }

    // Now make the c nodes for storing the content
    for(var i = 0; i < refs_count; i++){
	var nc = this.base.createElement("c");
	if(i in content){
	    var node_list = content[i];
	    for(var se = 0; se < node_list.length; se++){
		nc.appendChild(node_list[se].cloneNode(true));
	    }
	}
	else nc.appendChild(this.make_e(""));
	//Guppy.log(refs_count,first_ref,i,ne);
	if(i+1 == first_ref) first = nc.lastChild;
	for(var a in s['attrs'])
	    if(s['attrs'][a][i] != 0) nc.setAttribute(a,s['attrs'][a][i]);
	f.appendChild(nc);
    }
    Guppy.log("FF",f);
    return {"f":f, "first":first};
}

Guppy.prototype.is_small = function(nn){
    var n = nn.parentNode;
    while(n != null){
	if(n.getAttribute("size") == "s"){
	    return true;
	}
	n = n.parentNode.parentNode;
    }
    return false;
}

Guppy.prototype.insert_symbol = function(sym_name){
    var s = Guppy.kb.symbols[sym_name];
    if(this.is_blacklisted(s['type'])){
	Guppy.log("BLACKLISTED");
	return false;
    }
    var node_list = {};
    var content = {};
    var left_piece,right_piece;
    var cur = s['current'] == null ? 0 : parseInt(s['current']);
    var to_remove = [];
    var to_replace = null;
    var replace_f = false;
    
    Guppy.log("cur",cur);
    
    if(cur > 0){
	cur--;
	Guppy.log(cur);
	if(this.sel_status != Guppy.SEL_NONE){
	    Guppy.log("SEL",this.current);
	    var sel = this.sel_get();
	    sel_parent = sel.involved[0].parentNode;
	    Guppy.log("SCC", sel, "\nABC", sel.involved[0], sel_parent, sel.node_list, this.current);
	    to_remove = sel.involved;
	    left_piece = this.make_e(sel.remnant.firstChild.nodeValue.slice(0,this.sel_start.caret));
	    right_piece = this.make_e(sel.remnant.firstChild.nodeValue.slice(this.sel_start.caret));
	    content[cur] = sel.node_list;
	    Guppy.log("DONE_SEL",left_piece,content,right_piece);
	}
	else if(s['current_type'] == 'token'){
	    Guppy.log("TOKEN");
	    // If we're at the beginning, then the token is the previous f node
	    if(this.caret == 0 && this.current.previousSibling != null){
		content[cur] = [this.make_e(""), this.current.previousSibling, this.make_e("")];
		to_replace = this.current.previousSibling;
		replace_f = true;
	    }
	    else{
		// look for [0-9.]+|[a-zA-Z] immediately preceeding the caret and use that as token
		var prev = this.current.firstChild.nodeValue.substring(0,this.caret);
		var token = prev.match(/[0-9.]+$|[a-zA-Z]$/);
		if(token != null && token.length > 0){
		    token = token[0];
		    left_piece = this.make_e(this.current.firstChild.nodeValue.slice(0,this.caret-token.length));
		    right_piece = this.make_e(this.current.firstChild.nodeValue.slice(this.caret));
		    content[cur] = [this.make_e(token)];
		}
	    }
	}
    }
    if(!replace_f && (left_piece == null || right_piece == null)){
	Guppy.log("splitting",this.current,this.caret);
	left_piece = this.make_e(this.current.firstChild.nodeValue.slice(0,this.caret));
	right_piece = this.make_e(this.current.firstChild.nodeValue.slice(this.caret));
	to_remove = [this.current];
    }

    // By now:
    // 
    // content contains whatever we want to pre-populate the 'current' field with (if any)
    //
    // right_piece contains whatever content was in an involved node
    // to the right of the cursor but is not part of the insertion.
    // Analogously for left_piece
    //
    // Thus all we should have to do now is symbol_to_node(sym_type,
    // content) and then add the left_piece, resulting node, and
    // right_piece in that order.
    
    var new_current = null;
    var current_parent = this.current.parentNode;
    Guppy.log(this.current,this.current.parentNode);
    Guppy.log("SO",s,s["output"])
    Guppy.log("TR",this.current,this.current_parent,to_remove);
    
    var sym = this.symbol_to_node(sym_name,content);
    var f = sym.f;
    var new_current = sym.first;

    var next = this.current.nextSibling;

    Guppy.log("CSSCS",this.current,this.current.parentNode);

    if(replace_f){
	Guppy.log(to_replace,current_parent,f);
	current_parent.replaceChild(f,to_replace);
    }
    else{
	if(to_remove.length == 0) this.current.parentNode.removeChild(this.current);
	
	for(var i = 0; i < to_remove.length; i++){
	    Guppy.log("removing", to_remove[i]," from" , current_parent);
	    if(next == to_remove[i]) next = next.nextSibling;
	    current_parent.removeChild(to_remove[i]);
	}
	current_parent.insertBefore(left_piece, next);
	current_parent.insertBefore(f, next);
	current_parent.insertBefore(right_piece, next);
    }
    
    Guppy.log((new XMLSerializer()).serializeToString(this.base));
    Guppy.log(new_current);
    this.caret = 0;
    this.current = f;
    if(s['char']){
	this.current = this.current.nextSibling;
    }
    else this.down_from_f_to_blank();

    this.sel_clear();
    this.checkpoint(true);
    // if(new_current != null) {
    // 	if(new_current.firstChild == null) new_current.appendChild(this.base.createTextNode(""));
    // 	current = new_current;
    // }
    // else{ // WHEN COULD THIS HAPPEN--no children of an f?
    // 	current = right_piece;
    // }
    return true;
}

Guppy.prototype.sel_get = function(){
    Guppy.log("sel_start_end",this.sel_start,this.sel_end,this.current,this.caret);
    if(this.sel_status == Guppy.SEL_NONE){
	if(this.current.nodeName == 'f'){ // This block should be dead
	    Guppy.log("ABCD",this.current,this.current.previousSibling,this.current.parentNode);
	    this.sel_start = {"node":this.current, "caret":this.current.previousSibling.firstChild.nodeValue.length};
	    return {"node_list":[this.make_e(""),this.current,this.make_e("")],
		    "remnant":this.make_e(this.current.previousSibling.firstChild.nodeValue + this.current.nextSibling.firstChild.nodeValue),
		    "involved":[this.current.previousSibling, this.current, this.current.nextSibling]}
	}
	else return null;
    }
    var involved = [];
    var node_list = [];
    var remnant = null;

    if(this.sel_start.node == this.sel_end.node){
	return {"node_list":[this.make_e(this.sel_start.node.firstChild.nodeValue.substring(this.sel_start.caret, this.sel_end.caret))],
		"remnant":this.make_e(this.sel_start.node.firstChild.nodeValue.substring(0, this.sel_start.caret) + this.sel_end.node.firstChild.nodeValue.substring(this.sel_end.caret)),
		"involved":[this.sel_start.node]};
    }
    
    node_list.push(this.make_e(this.sel_start.node.firstChild.nodeValue.substring(this.sel_start.caret)));
    involved.push(this.sel_start.node);
    involved.push(this.sel_end.node);
    remnant = this.make_e(this.sel_start.node.firstChild.nodeValue.substring(0, this.sel_start.caret) + this.sel_end.node.firstChild.nodeValue.substring(this.sel_end.caret));
    var n = this.sel_start.node.nextSibling;
    while(n != null && n != this.sel_end.node){
	involved.push(n);
	node_list.push(n);
	n = n.nextSibling;
    }
    node_list.push(this.make_e(this.sel_end.node.firstChild.nodeValue.substring(0, this.sel_end.caret)));
    Guppy.log("NL",node_list);
    return {"node_list":node_list,
	    "remnant":remnant,
	    "involved":involved,
	    "cursor":0};
}

Guppy.prototype.print_selection = function(){
    var sel = this.sel_get();
    Guppy.log(sel);
    if(sel == null) return "[none]";
    var ans = "";
    ans += "node_list: \n";
    for(var i = 0; i < sel.node_list.length; i++){
	var n = sel.node_list[i];
	ans += (new XMLSerializer()).serializeToString(n) + "\n";
    }
    ans += "\ninvolved: \n";
    for(var i = 0; i < sel.involved.length; i++){
	var n = sel.involved[i];
	ans += (new XMLSerializer()).serializeToString(n) + "\n";
    }
    // ans += "\n remnant: \n";
    // ans += (new XMLSerializer()).serializeToString(sel.remnant) + "\n";
    Guppy.log(ans);
}

Guppy.prototype.make_e = function(text){
    var new_node = this.base.createElement("e");
    new_node.appendChild(this.base.createTextNode(text));
    return new_node;
}

Guppy.prototype.insert_string = function(s){
    if(this.sel_status != Guppy.SEL_NONE){
	this.sel_delete();
	this.sel_clear();
    }
    Guppy.log("ASD",this.caret,this.current,this.current.firstChild.nodeValue,s);
    this.current.firstChild.nodeValue = this.current.firstChild.nodeValue.splice(this.caret,s)
    this.caret += s.length;
    this.checkpoint();
}

Guppy.prototype.render = function(){
    var tex = this.render_node(this.base,"latex");
    Guppy.log(this.caret,"TEX", tex);
    katex.render(tex,this.editor);
}

Guppy.prototype.activate = function(){
    Guppy.active_guppy = this;
    this.editor_active = true;
    this.editor.style.backgroundColor='white';
    this.editor.style.border='1px solid gray';
    this.editor.focus();
}

Guppy.prototype.deactivate = function(){
    this.editor_active = false;
    this.editor.style.backgroundColor='#eee';
    this.editor.style.border='1px solid black';
    Guppy.kb.shift_down = false;
    Guppy.kb.ctrl_down = false;
    Guppy.kb.alt_down = false;
}

Guppy.prototype.sel_copy = function(){
    var sel = this.sel_get();
    if(!sel) return;
    this.clipboard = [];
    for(var i = 0; i < sel.node_list.length; i++){
	this.clipboard.push(sel.node_list[i].cloneNode(true));
    }
    this.sel_clear();
}

Guppy.prototype.sel_cut = function(){
    var node_list = this.sel_delete();
    this.clipboard = [];
    for(var i = 0; i < node_list.length; i++){
	this.clipboard.push(node_list[i].cloneNode(true));
    }
    this.sel_clear();
    this.checkpoint();
}

Guppy.prototype.sel_paste = function(){
    if(!(this.clipboard) || this.clipboard.length == 0) return;
    var real_clipboard = [];
    for(var i = 0; i < this.clipboard.length; i++){
	real_clipboard.push(this.clipboard[i].cloneNode(true));
    }
    Guppy.log("CLIPBOARD",this.clipboard);
    Guppy.log("PASTING");
    
    if(real_clipboard.length == 1){
	Guppy.log("wimp");
	this.current.firstChild.nodeValue = this.current.firstChild.nodeValue.substring(0,this.caret) + real_clipboard[0].firstChild.nodeValue + this.current.firstChild.nodeValue.substring(this.caret);
	this.caret += real_clipboard[0].firstChild.nodeValue.length;
    }
    else{
	var nn = this.make_e(real_clipboard[real_clipboard.length-1].firstChild.nodeValue + this.current.firstChild.nodeValue.substring(this.caret));
	this.current.firstChild.nodeValue = this.current.firstChild.nodeValue.substring(0,this.caret) + real_clipboard[0].firstChild.nodeValue;
	if(this.current.nextSibling == null)
	    this.current.parentNode.appendChild(nn)
	else
	    this.current.parentNode.insertBefore(nn, this.current.nextSibling)
	Guppy.log(nn);
	for(var i = 1; i < real_clipboard.length - 1; i++)
	    this.current.parentNode.insertBefore(real_clipboard[i], nn);
	this.current = nn;
	this.caret = real_clipboard[real_clipboard.length-1].firstChild.nodeValue.length
    }
    this.checkpoint();
}

Guppy.prototype.sel_clear = function(){
    this.sel_start = null;    
    this.sel_end = null;
    this.sel_status = Guppy.SEL_NONE;
}

Guppy.prototype.sel_delete = function(){
    var sel = this.sel_get();
    if(!sel) return;
    sel_parent = sel.involved[0].parentNode;
    sel_prev = sel.involved[0].previousSibling;
    Guppy.log("SD", sel, "\nABC", sel.involved[0], sel_parent, sel_prev);
    for(var i = 0; i < sel.involved.length; i++){
	var n = sel.involved[i];
	sel_parent.removeChild(n);
    }
    if(sel_prev == null){
	Guppy.log("PREVN",sel);
	if(sel_parent.firstChild == null)
	    sel_parent.appendChild(sel.remnant);
	else
	    sel_parent.insertBefore(sel.remnant, sel_parent.firstChild);
    }
    else if(sel_prev.nodeName == 'f'){
	Guppy.log("PREVF",sel_prev.nextSibling);
	if(sel_prev.nextSibling == null)
	    sel_parent.appendChild(sel.remnant);
	else
	    sel_parent.insertBefore(sel.remnant, sel_prev.nextSibling);
    }
    this.current = sel.remnant
    this.caret = this.sel_start.caret;
    return sel.node_list;
}

//Functions for handling navigation and editing commands: 

Guppy.prototype.sel_right = function(){
    if(this.sel_status == Guppy.SEL_NONE){
	this.set_sel_start();
	this.sel_status = Guppy.SEL_CURSOR_AT_END;
    }
    Guppy.log("EEEE");
    if(this.caret >= this.get_length(this.current)){
	var nn = this.current.nextSibling;
	if(nn != null){
	    this.current = nn.nextSibling;
	    this.caret = 0;
	    this.set_sel_boundary(Guppy.SEL_CURSOR_AT_END);
	    Guppy.log("asda");
	}
	else Guppy.log("at end while selecting");
    }
    else{
	this.caret += 1;
	this.set_sel_boundary(Guppy.SEL_CURSOR_AT_END);
	Guppy.log("asdb");
    }
    Guppy.log("SS",this.sel_status, this.sel_start, this.sel_end);
    if(this.sel_start.node == this.sel_end.node && this.sel_start.caret == this.sel_end.caret){
	this.sel_status = Guppy.SEL_NONE;
    }
}

Guppy.prototype.set_sel_boundary = function(sstatus){
    if(this.sel_status == Guppy.SEL_NONE) this.sel_status = sstatus;
    if(this.sel_status == Guppy.SEL_CURSOR_AT_START)
	this.set_sel_start();
    else if(this.sel_status == Guppy.SEL_CURSOR_AT_END)
	this.set_sel_end();
}

Guppy.prototype.sel_left = function(){
    if(this.sel_status == Guppy.SEL_NONE){
	this.set_sel_end();
	this.sel_status = Guppy.SEL_CURSOR_AT_START;
    }
    Guppy.log("EEEE");
    if(this.caret <= 0){
	var nn = this.current.previousSibling;
	if(nn != null){
	    this.current = nn.previousSibling;
	    this.caret = this.current.firstChild.nodeValue.length;
	    this.set_sel_boundary(Guppy.SEL_CURSOR_AT_START);
	    Guppy.log("asdeee");
	}
	else Guppy.log("at start while selecting");
    }
    else{
	this.caret -= 1;
	this.set_sel_boundary(Guppy.SEL_CURSOR_AT_START);
	Guppy.log("asdb");
    }
    Guppy.log("SS",this.sel_status, this.sel_start, this.sel_end);
    if(this.sel_start.node == this.sel_end.node && this.sel_start.caret == this.sel_end.caret){
	this.sel_status = Guppy.SEL_NONE;
    }
}

Guppy.prototype.right = function(){
    this.sel_clear();
    Guppy.log("R",this.current,this.caret);
    if(this.caret >= this.get_length(this.current)){
	var nn = this.next_node_from_e(this.current);
	if(nn != null){
	    this.current = nn;
	    this.caret = 0;
	}
	else Guppy.log("at end or problem");
    }
    else{
	this.caret += 1;
    }
    Guppy.log("R",this.current,this.current.parentNode,this.caret);
}

Guppy.prototype.get_length = function(n){
    if(Guppy.is_blank(n) || n.nodeName == 'f') return 0
    return n.firstChild.nodeValue.length;
    
}

Guppy.prototype.left = function(){
    this.sel_clear();
    Guppy.log("L",this.current,this.current.firstChild.nodeValue,this.caret);
    if(this.caret <= 0){
	var pn = this.prev_node_from_e(this.current);
	if(pn != null){
	    this.current = pn;
	    this.caret = this.current.firstChild.nodeValue.length;
	}
	else Guppy.log("at beginnning or problem");
    }
    else{
	this.caret -= 1;
    }
    Guppy.log(this.current,this.caret);
}

Guppy.prototype.delete_from_e = function(){
    // return false if we deleted something, and true otherwise.
    if(this.caret > 0){
	this.current.firstChild.nodeValue = this.current.firstChild.nodeValue.splicen(this.caret-1,"",1);
	this.caret--;
	Guppy.log("bk","|"+this.current.firstChild.nodeValue+"|",this.current.firstChild.nodeValue.length);
    }
    else{
	// The order of these is important
	if(this.current.previousSibling != null && this.current.previousSibling.getAttribute("c") == "yes"){
	    // The previous node is an f node but is really just a character.  Delete it.
	    this.current = this.current.previousSibling;
	    this.delete_from_f();
	}
	else if(this.current.previousSibling != null && this.current.previousSibling.nodeName == 'f'){
	    // We're in an e node just after an f node.  Move back into the f node (delete it?)
	    this.left();
	    return false;
	}
	else if(this.current.parentNode.previousSibling != null && this.current.parentNode.previousSibling.nodeName == 'c'){
	    // We're in a c child of an f node, but not the first one.  Go to the previous c
	    this.left();
	    return false;
	}
	else if(this.current.previousSibling == null && this.current.parentNode.nodeName == 'c' && (this.current.parentNode.previousSibling == null || this.current.parentNode.previousSibling.nodeName != 'c')){
	    // We're in the first c child of an f node and at the beginning--delete the f node
	    this.current = this.current.parentNode.parentNode;
	    this.delete_from_f();
	}
	else{
	    // We're at the beginning (hopefully!) 
	    Guppy.log("AT BEGINNING!");
	    return false;
	}
    }
    return true;
}

Guppy.prototype.backspace = function(){
    if(this.sel_status != Guppy.SEL_NONE){
	this.sel_delete();
	this.sel_status = Guppy.SEL_NONE;
	this.checkpoint();
    }
    else if(this.delete_from_e()){
	this.checkpoint();
    }
}

Guppy.prototype.right_paren = function(){
    if(this.current.nodeName == 'e' && this.caret < this.current.firstChild.nodeValue.length - 1) return;
    else this.right();
}

Guppy.prototype.up = function(){
    this.sel_clear();
    if(this.current.parentNode.hasAttribute("up")){
	var t = parseInt(this.current.parentNode.getAttribute("up"));
	Guppy.log("TTT",t);
	var f = this.current.parentNode.parentNode;
	Guppy.log(f);
	var n = f.firstChild;
	while(n != null && t > 0){
	    if(n.nodeName == 'c') t--;
	    if(t > 0) n = n.nextSibling;
	}
	Guppy.log(n);
	this.current = n.lastChild;
	this.caret = this.current.firstChild.nodeValue.length;
    }
    // else{
    // 	if(current.parentNode.parentNode.nodeName == 'f'){
    // 	    current = current.parentNode.parentNode.previousSibling;
    // 	    caret = current.firstChild.nodeValue.length;
    // 	}
    // }
}

Guppy.prototype.down = function(){
    this.sel_clear();
    if(this.current.parentNode.hasAttribute("down")){
	var t = parseInt(this.current.parentNode.getAttribute("down"));
	Guppy.log("TTT",t);
	var f = this.current.parentNode.parentNode;
	Guppy.log(f);
	var n = f.firstChild;
	while(n != null && t > 0){
	    if(n.nodeName == 'c') t--;
	    if(t > 0) n = n.nextSibling;
	}
	Guppy.log(n);
	this.current = n.lastChild;
	this.caret = this.current.firstChild.nodeValue.length;
    }
}

Guppy.prototype.home = function(){
    while(this.current.previousSibling != null)
	this.current = this.current.previousSibling;
    this.caret = 0;
}

Guppy.prototype.end = function(){
    while(this.current.nextSibling != null)
	this.current = this.current.nextSibling;
    this.caret = this.current.firstChild.nodeValue.length;
}

Guppy.prototype.checkpoint = function(overwrite){
    this.current.setAttribute("current","yes");
    this.current.setAttribute("caret",this.caret.toString());
    if(!overwrite) this.undo_now++;
    this.undo_data[this.undo_now] = this.base.cloneNode(true);
    this.undo_data.splice(this.undo_now+1, this.undo_data.length);
    this.current.removeAttribute("current");
    this.current.removeAttribute("caret");
}

Guppy.prototype.restore = function(t){
    Guppy.log("TTT",t);
    this.base = this.undo_data[t].cloneNode(true);
    Guppy.log((new XMLSerializer()).serializeToString(this.base));
    this.find_current();
    this.current.removeAttribute("current");
    this.current.removeAttribute("caret");
}

Guppy.prototype.find_current = function(){
    this.current = this.base.evaluate("//*[@current='yes']", this.base.documentElement, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    this.caret = parseInt(this.current.getAttribute("caret"));
}

Guppy.prototype.undo = function(){
    Guppy.log("UNDO");
    this.print_undo_data();
    if(this.undo_now <= 0) return;
    Guppy.log("UNDOING");
    this.undo_now--;
    this.restore(this.undo_now);
}

Guppy.prototype.redo = function(){
    Guppy.log("REDO");
    this.print_undo_data();
    if(this.undo_now >= this.undo_data.length-1) return;
    Guppy.log("REDOING");
    this.undo_now++;
    this.restore(this.undo_now);
}

Guppy.prototype.print_undo_data = function(){
    Guppy.log("UNDO DATA");
    Guppy.log(this.undo_now, this.undo_data.length);
    for(var i = 0; i < this.undo_data.length; i++){
	Guppy.log(i, (new XMLSerializer()).serializeToString(this.undo_data[i]));
    }
}

Guppy.prototype.done = function(s){
    this.done_callback();
}

Guppy.prototype.problem = function(s){
    Guppy.log(s);
    Guppy.log('b',(new XMLSerializer()).serializeToString(this.base));
    Guppy.log('c',(new XMLSerializer()).serializeToString(this.current));
}






// Keyboard stuff

Guppy.kb = {};

Guppy.kb.CARET = "\\color{red}{\\rule[-0.5ex]{0em}{0.7em}}"
Guppy.kb.SMALL_CARET = "\\color{red}{\\rule[0em]{0em}{0.3em}}"
Guppy.kb.SEL_CARET = "\\color{blue}{\\rule[-0.5ex]{0em}{0.7em}}"
Guppy.kb.SMALL_SEL_CARET = "\\color{blue}{\\rule[0em]{0em}{0.3em}}"
Guppy.kb.SEL_COLOR = "red"
Guppy.kb.CURRENT_BLANK = "\\color{red}{[?]}"
Guppy.kb.BLANK = "\\color{blue}{[?]}"
Guppy.kb.UP = 38;
Guppy.kb.DOWN = 40;
Guppy.kb.LEFT = 37;
Guppy.kb.RIGHT = 39;
Guppy.kb.RPAREN = 48;
Guppy.kb.SPACE = 32;
Guppy.kb.BACKSPACE = 8;
Guppy.kb.ENTER = 13;
Guppy.kb.HOME = 36;
Guppy.kb.END = 35;
Guppy.kb.shift_down = false;
Guppy.kb.ctrl_down = false;
Guppy.kb.alt_down = false;

Guppy.kb.k_syms = [];
Guppy.kb.sk_syms = []

Guppy.kb.k_chars = [];
Guppy.kb.sk_chars = [];

Guppy.kb.k_chars[107] = "+";
Guppy.kb.k_chars[108] = "-";
Guppy.kb.k_chars[109] = "*";
Guppy.kb.k_chars[110] = ".";
Guppy.kb.k_chars[111] = "/";

//Chrome

Guppy.kb.k_chars[187] = "=";
Guppy.kb.k_chars[188] = ",";
Guppy.kb.k_chars[189] = "-";
Guppy.kb.k_chars[190] = ".";
Guppy.kb.sk_chars[191] = "/";

// Firefox

Guppy.kb.k_chars[61] = "=";
Guppy.kb.k_chars[173] = "-";

Guppy.kb.k_syms[219] = "sqbrack";

Guppy.kb.sk_chars[61] = "+"; // Firefox
Guppy.kb.sk_chars[187] = "+"; // Chrome
Guppy.kb.sk_chars[49] = "!";

Guppy.kb.k_syms[191] = "slash";

Guppy.kb.sk_syms[54] = "exp";
Guppy.kb.sk_syms[56] = "*";
Guppy.kb.sk_syms[57] = "paren";
Guppy.kb.sk_syms[188] = "angle";
Guppy.kb.sk_syms[173] = "sub";
Guppy.kb.sk_syms[189] = "sub";
Guppy.kb.sk_syms[219] = "curlbrack";
Guppy.kb.sk_syms[220] = "abs";

Guppy.kb.symbols = {};

Guppy.prototype.is_blacklisted = function(symb_type){
    for(var i = 0; i < this.type_blacklist.length; i++)
	if(symb_type == this.type_blacklist[i]) return true;
    return false;
}

Guppy.symb_raw = function(symb_name,latex_symb,calc_symb){
    Guppy.kb.symbols[symb_name] = {"output":{"latex":[latex_symb],
					     "calc":[calc_symb]},"char":true};
}

Guppy.symb_func = function(func_name){
    Guppy.kb.symbols[func_name] = {"output":{"latex":["\\"+func_name+"\\left(",1,"\\right)"],
					     "calc":[func_name+"(",1,")"]}};
}

Guppy.key_up = function(e){
    var keycode = e.keyCode;
    if(keycode == 18) Guppy.kb.alt_down = false;
    else if(keycode == 17) Guppy.kb.ctrl_down = false;
    else if(keycode == 16) Guppy.kb.shift_down = false;
}
Guppy.key_down = function(e){
    if(Guppy.active_guppy == null){
	Guppy.log("INACTIVE");
	return;
    }
    var keycode = e.keyCode;
    if(Guppy.kb.ctrl_down){
	if(keycode == 67){ e.returnValue = false; e.preventDefault(); Guppy.active_guppy.sel_copy(); }
	if(keycode == 86){ e.returnValue = false; e.preventDefault(); Guppy.active_guppy.sel_paste(); }
	if(keycode == 88){ e.returnValue = false; e.preventDefault(); Guppy.active_guppy.sel_cut(); }
	if(keycode == 89){ e.returnValue = false; e.preventDefault(); Guppy.active_guppy.redo(); }
	if(keycode == 90){ e.returnValue = false; e.preventDefault(); Guppy.active_guppy.undo(); }
	if(keycode == Guppy.kb.ENTER){ e.returnValue = false; e.preventDefault(); Guppy.active_guppy.done(); }
    }
    else if(Guppy.kb.shift_down){
	e.returnValue = false; e.preventDefault(); 
	Guppy.log(e.keyCode,e.srcElement);
	if(keycode == Guppy.kb.UP){ Guppy.active_guppy.insert_symbol("exp"); }
	else if(keycode == Guppy.kb.DOWN){ Guppy.active_guppy.insert_symbol("sub"); }
	else if(keycode == Guppy.kb.LEFT){ Guppy.active_guppy.sel_left(); }
	else if(keycode == Guppy.kb.RIGHT){ Guppy.active_guppy.sel_right(); }
	else if(keycode == Guppy.kb.RPAREN){ Guppy.active_guppy.right_paren(); }
	else if(keycode in Guppy.kb.sk_chars){ Guppy.active_guppy.insert_string(Guppy.kb.sk_chars[keycode]); }
	else if(keycode in Guppy.kb.sk_syms){ Guppy.active_guppy.insert_symbol(Guppy.kb.sk_syms[keycode]); }
	else if(65 <= e.keyCode && e.keyCode <= 90){ Guppy.active_guppy.insert_string(String.fromCharCode(e.keyCode)); }
    }
    else if(!Guppy.kb.alt_down){
	e.returnValue = false; e.preventDefault(); 
	Guppy.log(e.keyCode,e.srcElement);
	if(keycode == Guppy.kb.UP){ e.returnValue = false; e.preventDefault(); Guppy.active_guppy.up(); }
	else if(keycode == Guppy.kb.DOWN){ e.returnValue = false; e.preventDefault(); Guppy.active_guppy.down(); }
	else if(keycode == Guppy.kb.LEFT){ e.returnValue = false; e.preventDefault(); Guppy.active_guppy.left(); }
	else if(keycode == Guppy.kb.RIGHT || keycode == Guppy.kb.SPACE){ e.returnValue = false; e.preventDefault(); Guppy.active_guppy.right(); }
	else if(keycode == Guppy.kb.HOME){ e.returnValue = false; e.preventDefault(); Guppy.active_guppy.home(); }
	else if(keycode == Guppy.kb.END){ e.returnValue = false; e.preventDefault(); Guppy.active_guppy.end(); }
	else if(keycode == Guppy.kb.BACKSPACE){ e.returnValue = false; e.preventDefault(); Guppy.active_guppy.backspace(); }
	else if(keycode == 16) Guppy.kb.shift_down = true;
	else if(keycode == 17) Guppy.kb.ctrl_down = true;
	else if(keycode == 18) Guppy.kb.alt_down = true;
	else if(keycode in Guppy.kb.k_chars){ Guppy.active_guppy.insert_string(Guppy.kb.k_chars[keycode]); }
	else if(keycode in Guppy.kb.k_syms){ Guppy.active_guppy.insert_symbol(Guppy.kb.k_syms[keycode]); }
	else if((65 <= e.keyCode && e.keyCode <= 90) || (48 <= e.keyCode && e.keyCode <= 57)){
	    var ch = String.fromCharCode(e.keyCode).toLowerCase();
	    Guppy.active_guppy.insert_string(ch);
	}
    }
    for(var s in Guppy.kb.symbols){
	// Guppy.log(current);
	if(Guppy.active_guppy.current.nodeName == 'e' && !(Guppy.is_blank(Guppy.active_guppy.current)) && Guppy.active_guppy.current.firstChild.nodeValue.search_at(Guppy.active_guppy.caret,s)){
	    //Guppy.log("INSERTION OF ",s);
	    //Guppy.log(current.nodeValue);
	    var temp = Guppy.active_guppy.current.firstChild.nodeValue;
	    var temp_caret = Guppy.active_guppy.caret;
	    Guppy.active_guppy.current.firstChild.nodeValue = Guppy.active_guppy.current.firstChild.nodeValue.slice(0,Guppy.active_guppy.caret-s.length)+Guppy.active_guppy.current.firstChild.nodeValue.slice(Guppy.active_guppy.caret);
	    //Guppy.log(current.nodeValue);
	    Guppy.active_guppy.caret -= s.length;
	    var success = Guppy.active_guppy.insert_symbol(s);
	    if(!success){
		Guppy.active_guppy.current.firstChild.nodeValue = temp;
		Guppy.active_guppy.caret = temp_caret;
	    }
	    break;
	}
    }
    Guppy.active_guppy.render();
}


Guppy.log = function(){
    if(!(Guppy.active_guppy) || Guppy.active_guppy.debug_mode == false) return;
    var s = "";
    for(var i = 0; i < arguments.length; i++){
	console.log(arguments[i]);
    }
}
