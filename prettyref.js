(function(){	// IE shim
	if((typeof Node === "undefined") || !Node.prototype.hasOwnProperty('textContent')) {	// IE8
		var nodeValue = Object.getOwnPropertyDescriptor(Text.prototype, "nodeValue");
		Object.defineProperty(Text.prototype, "textContent", {
		        get: function() {return nodeValue.get.call(this);},
		        set: function(x) {return nodeValue.set.call(this,x);}
		});
		var innerText = Object.getOwnPropertyDescriptor(Element.prototype, "innerText");
		Object.defineProperty(Element.prototype, "textContent", {
			get: function() {return innerText.get.call(this);},
		        set: function(x) {
	        	        var c;
		                while((c=this.firstChild)) this.removeChild(c);
		                if(x!==null) {
        	        	        c=document.createTextNode(x);
                		        this.appendChild(c);
		                }
		                c=null;
		                return x;
		        }
		});
	}
})();

function toArray(a) {
	try {return Array.prototype.slice.call(a);}
	catch(e) {
		var result=[],i,l;
		for(i=0,l=a.length; i<l; ++i) result.push(a[i]);
		return result;
	}
}

function DMhighlight(pre, params) {
	function own(a,b) {return a.hasOwnProperty(b);}
	function ext(a,b) {
		for(var k in b) {if(own(b,k)) a[k] = b[k];}
		return a;
	}

	var dm_keywords_rx = /^(break|new|del|for|global|var|proc|verb|set|static|arg|const|goto|if|in|as|continue|return|do|while|else|sleep|spawn|switch|tmp|to)$/;
	params = params || {};
	var hl = ext({num:true}, params.highlight);
	var use_ids = !!hl.id;
	var use_nums = !!hl.num;
	var keepTabs = !!params.keepTabs;
	var tablen = params.tabs || 4;

	var fulltab = '';
	for(var i=0; i<tablen; ++i) fulltab += ' ';

	function DM_nodes(txt) {
		var nodes = [], stack = [];
		var state = 0;
		var i,j,len,id;
		var sol,sos,ch;
		txt = txt.replace(/\r/g,'');
		if(params.trim != false) {
			txt = txt.replace(/^(\s*\n)*/g, '');
			txt = txt.replace(/[\s\n]*$/g, '');
		}
		if(!keepTabs) {
			do {
				i = txt;
				txt = txt.replace(/^(\t*)\t/gm,'$1'+fulltab);
			} while(i != txt);
			do {
				i = txt;
				txt = txt.replace(/^([^\t\n]+)\t/gm,function(m,a){
					var j = a.length % tablen;
					do {a += ' '; ++j;} while(j < tablen);
					return a;
				});
			} while(i != txt);
			txt = txt.replace(/^\t/gm,fulltab);
		}
		len = txt.length;

		function change_state(new_state,at) {
			if(new_state != state && sos != at) {
				var sname=null,n;
				if(state & 0x22) sname = "s";
				else if(state & 4) sname = "c";
				else if(state & 8) sname = "pp";
				else if(state & 0x40) sname = "k";
				else if(state & 0x80) sname = "n";
				else if(state & 0x100) sname = "i";
				if((n=nodes[nodes.length-1]) && n.state == sname)
					n.text += txt.substr(sos,at-sos);
				else
					nodes.push({state:sname, text:txt.substr(sos,at-sos)});
				sos = at;
			}
			state = new_state;
		}

		function is_top_state() {
			return !state && !stack.length;
		}

		function pop_state(at) {
			if(stack.length) change_state(stack.pop(),at);
			else if(state) change_state(0);
			else return false;
			return true;
		}

		function push_state(new_state,at) {
			if(new_state != state) {
				stack.push(state);
				change_state(new_state, at);
			}
		}

		function parse_number() {	// already got first character in ch
			var dec,e,at;
			if(ch == '0') {	// hex, octal, or 0.xxxx which is decimal
				ch = txt[i];
				if(ch == 'x') {	// hex
					while(++i<len && txt[i].match(/[a-f]/i));
					return;
				}
				if(ch >= '0' && ch <= '7') {	// octal
					while(++i<len && txt[i].match(/[0-7]/i));
					return;
				}
			}
			while(i<len) {
				ch = txt[at=i];
				if(ch == '.') {
					if(dec) return;
					ch = txt[++i];
					// fall through to digit test -- always expect digit after decimal
				}
				else if(ch == 'e' || ch == 'E') {
					if(e) return;
					dec = e = true;
					ch = txt[++i];
					if(ch == '+' || ch == '-') ch = txt[++i];
					// fall through to digit test -- always expect digit after e and optional sign
				}
				if(ch < '0' || ch > '9') {i=at; return;}
				++i;
			}
		}

		function parse_id() {
			var at=i-1;
			while(i<len) {
				ch = txt[i];
				if(ch == '_' || (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) ++i;
				else break;
			}
			return txt.substr(at,i-at);
		}

		for(i=sol=sos=0; i<len;) {
			ch = txt[i++];
			switch(ch) {
				case '\n':
					//j = state==8; id = sos;	// debugging
					while(i<len && txt[i]=='\n') ++i;
					sol = i;
					while(!(state & 1) && !is_top_state()) pop_state(i);
					//if(j) console.log(nodes[nodes.length-1], id, sos, sol, i);
					continue;
				/* case '\t':
					// no longer uses special code; was taken care of above
					continue; */
				case '\\':
					if(i < len) {
						ch = txt[i++];
						if(ch == '\n') sol = i;
						//else if(ch == '\t') --i;	// let tab handling take care of this
					}
					continue;
				case '/':
					if(i < len && !(state & 0x26)) {
						ch = txt[i];
						if(ch == '/') {	// comment to end of line
							push_state(4, i-1);
							i = txt.indexOf('\n', i+1);
							if(i < 0) i = len;
							continue;
						}
						if(ch == '*') {	// extended comment
							push_state(5, i-1);
							++i;
							continue;
						}
					}
					break;
				case '*':
					if(i < len && state == 5 && txt[i] == '/') {	// close ext comment
						pop_state(++i);
						continue;
					}
					break;
				case '[':
					if(state & 0x22) {push_state(0x10,i-1); continue;}
					break;
				case ']':
					if(state & 0x10) {pop_state(i); continue;}
					break;
				case '#':
					if(!state && txt.substr(sol,i-sol-1).match(/^\s*$/)) {
						push_state(8, i-1);
						continue;
					}
					break;
				case '\'':
					if(state == 0x20) {	// close squote
						pop_state(i);
						continue;
					}
					if(!(state & ~0x10)) {	// open squote
						push_state(0x20, i-1);
						continue;
					}
					break;
				case '\"':
					if(state == 2) {	// close string
						pop_state(i);
						continue;
					}
					if(state == 3 && i<len && txt[i]=='}') {	// close ext string
						pop_state(++i);
						continue;
					}
					if(!(state & ~0x10)) {	// open string
						push_state(2, i-1);
						continue;
					}
					break;
				case '{':
					if(!(state & ~0x10) && i<len && txt[i]=='\"') {	// open ext string
						push_state(3, i-1);
						++i;
						continue;
					}
					break;
				default:
					if(!(state & ~0x10)) {
						// check for number
						if(ch>='0' && ch<='9') {
							push_state((use_nums ? 0x80 : state), i-1);
							parse_number();
							pop_state(i);
							continue;
						}
						// check for ident or keyword
						if(ch == '_' || (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')) {
							push_state(1, i-1);
							id = parse_id();
							state = id.match(dm_keywords_rx) ? 0x40 : (use_ids ? 0x100 : state);
							pop_state(i);
						}
					}
					break;
			}
		}
		change_state(-1,len);
		return nodes;
	}

	function DM_buildNodes(d,nodes,params) {
		var sp,i,j,k,s,l=nodes.length;

		//for(i=0; i<l; ++i) console.log(nodes[i].state, JSON.stringify(nodes[i].text));

		for(i=0; i<l; ++i) {
			if(!(s=nodes[i].state)) {
				d.appendChild(document.createTextNode(nodes[i].text));
				continue;
			}
			nodes[i].state = null;
			for(k=i,j=i+1; j<l; ++j) {
				if(!nodes[j].state) break;
				if(nodes[j].state == s) {k=j; nodes[j].state=null;}
			}

			sp = document.createElement('span');
			sp.className = 'DM'+s;
			sp.appendChild(document.createTextNode(nodes[i].text));
			if(k>i) {
				if(k>i+1) DM_buildNodes(sp,nodes.slice(i+1,k),params);
				sp.appendChild(document.createTextNode(nodes[k].text));
				i = k;
			}
			d.appendChild(sp);
		}
	}

	function now() {return (new Date()).getTime();}

	function appendNewline(elem) {
		if(elem.nodeType == 3) {elem.textContent += '\n'; return true;}
		if(elem.nodeType != 1) return false;
		var e,l,t;
		for(e=elem.lastChild; e; e=e.prevSibling) {
			if((t=e.nodeType) == 1 || t == 3) return appendNewline(e);
		}
		elem.appendChild(document.createTextNode('\n'));
		return true;
	}

	function newlineBefore(elem) {
		var e;
		for(e=elem.prevSibling; e; e=e.prevSibling) {if(e.appendNewline(elem)) return;}
		elem.parentNode.insertBefore(document.createTextNode('\n'), elem);
	}

	function collapseBr(pre) {
		var i,a=toArray(pre.querySelectorAll('br')),l=a.length;
		for(i=0; i<l; ++i) {
			newlineBefore(a[i]);
			a[i].parentNode.removeChild(a[i]);
		}
	}

	function gettext(pre) {
		collapseBr(pre);
		return pre.textContent;
	}

	var c;
	var start=now();
	var nodes = DM_nodes(own(params,'text') ? params.text : gettext(pre));
	var after = pre.nextSibling, parent = pre.parentNode;
	parent.removeChild(pre);
	while(c=pre.firstChild) pre.removeChild(c);
	pre = params.output||pre;
	DM_buildNodes(pre,nodes,params);
	parent.insertBefore(pre,after);
}

function makearticle(p) {
	var d;
	p.appendChild(d=document.createElement('div'));
	d.className = 'article';
	return d;
}
function collapse() {
	if(!window.parent || window.parent==window) {
		if(document.body.className=='refpage') {
			while((e=document.querySelector('xmp'))) {
				n = document.createElement('pre');
				n.className = 'dmcode';
				DMhighlight(e,{output:n});
			}
		}
		return;
	}
	var ds0=(document.stylesheets||document.styleSheets)[0];
	if(ds0.insertRule) {
		ds0.insertRule(".refbody > * {display: none;}", 0);
		ds0.insertRule(".refbody > .open {display: block;}", 0);
	}
	else {
		ds0.addRule(".refbody > *", "display: none", 0);
		ds0.addRule(".refbody > .open", "display: block", 0);
	}

	var f=document.createDocumentFragment();
	var b,b2,d,i,e,n;
	f.appendChild(b=document.getElementById('refbody'));
	f.appendChild(b2=document.createElement('div'));
	b2.className='refbody';
	e=b.firstChild;
	for(e=b.firstChild,d=makearticle(b2); e; e=n) {
		n = e.nextSibling;
		b.removeChild(e);
		if(e.tagName == 'HR') {
			d=makearticle(b2);
			continue;
		}
		if(e.tagName == 'A' && (i=e.getAttribute('name'))) {
			d.setAttribute('name', i);
			while(i=e.lastChild) {
				b.insertBefore(i,n);
				n = i;
			}
		}
		else d.appendChild(e);
	}
	while((e=b2.querySelector('.article:not([name])'))) b2.removeChild(e);
	document.body.appendChild(b2);

	var oldhash;
	var activearticle;
	var hashpoll = function() {
		var h=(document.location.hash||'#').substr(1),x,p;
		if(h != oldhash) {
			oldhash = h;
			if(activearticle) activearticle.classList.remove('open');
			activearticle = document.querySelector('.article[name="'+h+'"]')
			if(activearticle) {
				while((x=activearticle.querySelector('xmp'))) {
					p = document.createElement('pre');
					p.className = 'dmcode';
					DMhighlight(x,{output:p});
				}
				activearticle.classList.add('open');
				if((window.parent||window) != window) window.parent.postMessage("nav:"+h,'*');
			}
		}
	}
	setInterval(hashpoll, 100);
}

function contentLoaded(win, fn) {
	var done = false, top = true,
	doc = win.document,
	root = doc.documentElement,
	modern = doc.addEventListener,
	add = modern ? 'addEventListener' : 'attachEvent',
	rem = modern ? 'removeEventListener' : 'detachEvent',
	pre = modern ? '' : 'on',
	init = function(e) {
		if (e.type == 'readystatechange' && doc.readyState != 'complete') return;
		(e.type == 'load' ? win : doc)[rem](pre + e.type, init, false);
		if (!done && (done = true)) fn.call(win, e.type || e);
	},
	poll = function() {
		try { root.doScroll('left'); } catch(e) { setTimeout(poll, 50); return; }
		init('poll');
	};
	if (doc.readyState == 'complete') fn.call(win, 'lazy');
	else {
		if (!modern && root.doScroll) {
			try { top = !win.frameElement; } catch(e) { }
			if (top) poll();
		}
		doc[add](pre + 'DOMContentLoaded', init, false);
		doc[add](pre + 'readystatechange', init, false);
		win[add](pre + 'load', init, false);
	}
}
contentLoaded(window,collapse);
