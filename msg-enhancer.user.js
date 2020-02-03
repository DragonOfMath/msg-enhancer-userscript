// ==UserScript==
// @author      DragonOfMath
// @name        MSG Enhancer
// @description Adds vote & fave buttons to index pages
// @version     1.6
// @grant       GM.getValue
// @grant       GM.setValue
// @grant       GM.deleteValue
// @include     https://e621.net/post*
// @include     https://e926.net/post*
// ==/UserScript==

/*
Changelog:
1.0 - Release
1.1 - Direct download added, arrow buttons widened
1.2 - Downvoting fixed, page injection reworked, IIFE'd
1.3 - Better API for downloading; formatting fixed
1.4 - Syncing also removes deleted items
1.5 - Better UI, fixed going back causing duplicate buttons
1.6 - Toggle hiding posts you've voted on
 */

(function (W, D) {
	// if the page has already been processed, don't repeat
	if (D.querySelector('#purge-cache'))
		return;

	// quick early exit if the user isn't logged in
	const username = D.cookie.match(/login=([^;]+);/)[1];
	const isDirectLink = /\/show\//.test(location.href);

	const $ = x => D.querySelector(x);
	const $a = x => D.querySelectorAll(x);
	const E = x => D.createElement(x);
	const T = x => D.createTextNode(x);

	if (typeof exportFunction === 'undefined') {
		exportFunction = x => x;
	}
	if (typeof GM === 'undefined') {
		const GM = {
			data: {},
			async getValue(id, defaultValue) {
				return Promise.resolve(this.data[id] || defaultValue);
			},
			async setValue(id, value) {
				return Promise.resolve(this.data[id] = value);
			},
			async deleteValue(id) {
				return Promise.resolve(delete this.data[id]);
			}
		};
	}

	function search(tags = [], limit = 100, page = 1) {
		return fetch(`https://${window.location.host}/post/index.json?tags=${tags.join('+')}&limit=${limit}&page=${page}`, {
			host: window.location.host,
			json: true,
			headers: {
				'User-Agent': navigator.userAgent,
				'X-Requested-With': 'XMLHttpRequest'
			}
		}).then(x => x.json());
	}
	function show(postID) {
		return fetch(`https://${window.location.host}/post/show.json?id=${postID}`, {
			host: window.location.host,
			json: true,
			headers: {
				'User-Agent': navigator.userAgent,
				'X-Requested-With': 'XMLHttpRequest'
			}
		}).then(x => x.json());
	}

	function download(uri, filename) {
		console.log('Downloading', uri, 'as', filename);
		var a = D.createElement('a');
		a.setAttribute('href', uri);
		a.setAttribute('download', filename);
		D.body.appendChild(a);
		a.click();
		a.remove();
	}

	class GMUserData {
		constructor(name) {
			this.name = name;
			this.id = 'e621-' + name;
			this.data = {};
			this.BUSY = false;
		}
		set(id, x) {
			this.data[id] = x;
		}
		get(id) {
			return this.data[id];
		}
		delete (id) {
			delete this.data[id];
		}
		async clear() {
			if (this.BUSY)
				return false;
			try {
				console.log('Clearing', this.id, 'of data');
				await GM.deleteValue(this.id);
				this.data = {};
				return true;
			} catch (e) {
				console.log(e);
				return false;
			}
		}
		async save() {
			if (this.BUSY)
				return false;
			try {
				var data = JSON.stringify(this.data) || {};
				console.log('Saving', this.id, '->', data.length, 'bytes');
				await GM.setValue(this.id, data);
				return true;
			} catch (e) {
				console.log(e);
				return false;
			}
		}
		async load(data) {
			if (this.BUSY)
				return false;
			try {
				if (data)
					console.log('Loading data from local source...');
				else
					data = await GM.getValue(this.id, '{}');
				console.log('Loading', this.id, '<-', data.length, 'bytes');
				this.data = data instanceof Object ? data : JSON.parse(data);
				return true;
			} catch (e) {
				console.log(e);
				return false;
			}
		}
		async sync() {
			this.BUSY = true; // prevent cache reloading during sync
			console.log('Cleaning cache...');
			let deleted = 0;
			for (let id in this.data) {
				let post = await show(id);
				if (!post || post.id != id || post.status == 'deleted') {
					console.log('Deleting ' + id);
					deleted++;
					this.delete (id);
				}
			}

			let page = 0;
			let synced = 0;
			let _posts;
			do {
				page++;
				console.log('Fetching page ' + page + ' of favorites...');
				_posts = await search([`fav:${this.name}`], 100, page);
				console.log('Received ' + _posts.length + ' posts.');
				for (let p of _posts) {
					this.set(p.id, Object.assign(this.get(p.id) || {}, {
							fave: 1
						}));
				}
				synced += _posts.length;
				console.log('Synced: ' + synced);
			} while (_posts.length == 100);

			this.BUSY = false;
			await this.save();
			return {
				synced,
				deleted
			};
		}
		async export() {
			download('data:application/json;base64,' + btoa(JSON.stringify(this.data)), `${this.id}.json`);
		}
		async import() {
			var input = E('input');
			input.setAttribute('type', 'file');
			input.addEventListener('change', e => {
				var file = e.target.files[0];
				if (!/json$/.test(file.type || file.name))
					return alert('Invalid filetype.'); // Chrome: file.type is undefined
				console.log('Reading file', file.name);
				var fr = new FileReader();
				fr.onload = async(e) => {
					await load(e, e.target.result);
					await this.save();
				};
				fr.readAsText(file);
			});
			input.click();
		}
	}

	// establishes interaction with the sandbox from the page
	class Page {
		constructor(objName) {
			this.scriptNode = E('script');
			this.scriptNode.setAttribute('type', 'application/json');
			this.scriptNode.setAttribute('id', objName);
			this.scriptNode.textContent = `window.${objName} = {};`;
			D.body.appendChild(this.scriptNode);
			this.pageObjectName = objName;
			this.pageObject = W[objName];
		}
		// imports functions from here onto the page
		import(functions) {
			for (var f of functions) {
				this.pageObject[f.name] = exportFunction(f, this.pageObject);
			}
		}
		// exports functions from the page into here
		export(functionNames) {
			for (var fn of functionNames) {
				window[fn] = W[fn];
			}
		}
		// gets the callback string for the function
		getCallback(fn) {
			return `${this.pageObjectName}.${fn.name||fn}`;
		}
		// gets the invocation string for the function
		getInvocation(fn, args = []) {
			return `${this.pageObjectName}.${fn.name||fn}(${args.join(',')});`;
		}
		// forces the event listener to use the given callback
		bindEvent(elem, event, fn, args) {
			elem.setAttribute(event, this.getInvocation(fn, args));
			return elem;
		}
		// inserts styles in a new node
		injectCSS(styleObj) {
			var styleNode = E('style');
			var txt = '\n';
			for (var selector in styleObj) {
				txt += selector + ' {\n';
				for (var attr in styleObj[selector]) {
					txt += '\t' + attr + ': ' + styleObj[selector][attr] + ';\n';
				}
				txt += '}\n';
			}
			styleNode.textContent = txt;
			D.body.appendChild(styleNode);
		}
	}

	// create the user instance which will communicate with Greasemonkey
	const user = new GMUserData(username);
	// create the page instance which will communicate with the userscript from the page
	const page = new Page('msg');
	const posts = {};
	
	// option for hiding/showing posts that the user voted on
	var hideUpvotedPosts = false;
	var hideDownvotedPosts = true;
	function updateVisibility() {
		for (var id in posts) {
			posts[id].updateVisibility();
		}
	}

	class Post {
		constructor(root, id) {
			this.root = root;
			this.id = id;
			this.root.__post__ = this;
			if (isDirectLink) {
				this._score = root.querySelector('#post-score-' + this.id);
				this.faves = $('#favorited-by');

				this.upvote = $('#voteup');
				this.downvote = $('#votedown');
				this.favorite = $('#add-to-favs');
				this.unfavorite = $('#remove-from-favs');

				this.favorite.firstElementChild.setAttribute('onclick', AjaxWrapper('/favorite/create.json', {
						id: this.id
					}, page.getCallback(_favorite)));
				this.unfavorite.firstElementChild.setAttribute('onclick', AjaxWrapper('/favorite/destroy.json', {
						id: this.id
					}, page.getCallback(_unfavorite)));
			} else {
				this._score = root.querySelector('#post-score-score\\ post-score-' + this.id);
				this.faves = root.querySelector('.post-score-faves');

				this.upvote = E('span');
				this.downvote = E('span');
				this.favorite = E('span');
				this.unfavorite = E('span');
				this.downloader = E('span');

				this.upvote.setAttribute('id', 'voteup');
				this.upvote.setAttribute('title', 'upvote');
				this.downvote.setAttribute('id', 'votedown');
				this.downvote.setAttribute('title', 'downvote');
				this.favorite.setAttribute('id', 'add-to-favs');
				this.favorite.setAttribute('title', 'fave');
				this.unfavorite.setAttribute('id', 'remove-from-favs');
				this.unfavorite.setAttribute('title', 'unfave');
				this.downloader.setAttribute('id', 'download');
				this.downloader.setAttribute('title', 'download source file');

				this.favorite.innerHTML = this.unfavorite.innerHTML = '❤';
				this.unfavorite.style.display = 'none';
				this.downloader.innerHTML = '📥';

				var container = E('div');
				container.appendChild(this.upvote);
				container.appendChild(T(' / '));
				container.appendChild(this.downvote);
				container.appendChild(T(' / '));
				container.appendChild(this.favorite);
				container.appendChild(this.unfavorite);
				container.appendChild(T(' / '));
				container.appendChild(this.downloader);
				this.root.appendChild(container);

				this.favorite.setAttribute('onclick', AjaxWrapper('/favorite/create.json', {
						id: this.id
					}, page.getCallback(_favorite)));
				this.unfavorite.setAttribute('onclick', AjaxWrapper('/favorite/destroy.json', {
						id: this.id
					}, page.getCallback(_unfavorite)));
				this.downloader.setAttribute('onclick', page.getInvocation(_download, [this.id]));
			}

			this.upvote.innerHTML = '⬆';
			this.downvote.innerHTML = '⬇';

			this.upvote.setAttribute('onclick', AjaxWrapper('/post/vote.json', {
					id: this.id,
					score: 1
				}, page.getCallback(_upvote)));
			this.downvote.setAttribute('onclick', AjaxWrapper('/post/vote.json', {
					id: this.id,
					score: -1
				}, page.getCallback(_downvote)));
		}
		get score() {
			return Number(this._score.innerHTML.match(/\d+/));
		}
		set score(x) {
			if (x > 0) {
				this._score.innerHTML = '↑' + x;
				this._score.setAttribute('class', 'greentext');
			} else if (x < 0) {
				this._score.innerHTML = '↓' + x;
				this._score.setAttribute('class', 'redtext');
			} else {
				this._score.innerHTML = '↕' + x;
				this._score.setAttribute('class', '');
			}
		}
		get vote() {
			if (this.upvote.className == 'greentext')
				return 1;
			else if (this.downvote.className == 'redtext')
				return -1;
			return 0;
		}
		set vote(x) {
			this.upvote.className = x > 0 ? 'greentext' : '';
			this.downvote.className = x < 0 ? 'redtext' : '';
		}
		get fave() {
			return this.favorite.style.display == 'none' ? 1 : 0;
		}
		set fave(x) {
			this.favorite.style.display = x ? 'none' : '';
			this.unfavorite.style.display = x ? '' : 'none';
		}
		get data() {
			return {
				v: this.vote,
				f: this.fave
			};
		}
		set data({vote,v,fave,f}) {
			this.vote = vote || v;
			this.fave = fave || f;
		}
		async save() {
			var data = this.data;
			if (!data.v)
				delete data.v;
			if (!data.f)
				delete data.f;
			if (data.v || data.f) {
				user.set(this.id, data);
			} else {
				user.delete (this.id);
			}
			await user.save();
		}
		load() {
			this.data = user.get(this.id) || {};
			this.updateVisibility();
		}
		async download() {
			var post = await show(this.id);
			var url = post.file_url;
			window.open(url, '_blank');
		}
		updateVisibility() {
			if (isDirectLink)
				return;
			if ((this.vote > 0 && hideUpvotedPosts) || (this.vote < 0 && hideDownvotedPosts)) {
				this.hide();
			} else {
				this.show();
			}
		}
		show() {
			this.root.parentElement.style.display = '';
		}
		hide() {
			this.root.parentElement.style.display = 'none';
		}
	}

	// creates an Ajax request line for onclick events
	function AjaxWrapper(request, parameters, callback) {
		return `new Ajax.Request('${request}', { parameters:${JSON.stringify(parameters)}, onComplete:${callback.name||callback}})`;
	}

	/* These functions with an underscore are exported to the unsafeWindow */

	async function _upvote(e) {
		if (user.BUSY)
			return alert('You may not vote or fave while the script is busy.');
		var response = e.responseJSON;
		var id = e.request.parameters.id;
		var root = $(`#post-score-score\\ post-score-${id},#post-score-${id}`).parentElement;
		var post = posts[id];
		if (response.change > 0) {
			W.notice('Upvoted #' + id);
			post.vote = 1;
		} else if (post.upvote.className != 'greentext') {
			console.log('Correcting upvote for %s', id);
			return post.upvote.click();
		} else {
			W.notice('Unvoted #' + id);
			post.vote = 0;
		}
		post.score = response.score;
		post.updateVisibility();
		await post.save();
	}

	async function _downvote(e) {
		if (user.BUSY)
			return alert('You may not vote or fave while the script is busy.');
		var response = e.responseJSON;
		var id = e.request.parameters.id;
		var root = $(`#post-score-score\\ post-score-${id},#post-score-${id}`).parentElement;
		var post = posts[id];
		if (response.change < 0) {
			W.notice('Downvoted #' + id);
			post.vote = -1;
		} else if (post.downvote.className != 'redtext') {
			console.log('Correcting downvote for %s', id);
			return post.downvote.click();
		} else {
			W.notice('Unvoted #' + id);
			post.vote = 0;
		}
		post.score = response.score;
		post.updateVisibility();
		await post.save();
	}

	async function _favorite(e) {
		if (user.BUSY)
			return alert('You may not vote or fave while the script is busy.');
		var response = e.responseJSON;
		var id = e.request.parameters.id;
		var root = $(`#post-score-score\\ post-score-${id},#post-score-${id}`).parentElement;
		var post = posts[id];
		if (!(response.success || e.status == 423))
			return W.error(response.reason);
		post.fave = 1;
		W.notice('Post #' + post.id + ' added to favorites');
		if (isDirectLink) {
			post.faves.innerHTML = W.Favorite.link_to_users(response.favorited_users);
		} else if (response.success) {
			// only update the fave count if it's successful
			post.faves.innerHTML = '♥' + (Number(post.faves.innerHTML.substring(1)) + 1);
		}
		await post.save();
	}

	async function _unfavorite(e) {
		if (user.BUSY)
			return alert('You may not vote or fave while the script is busy.');
		var response = e.responseJSON;
		var id = e.request.parameters.id;
		var root = $(`#post-score-score\\ post-score-${id},#post-score-${id}`).parentElement;
		var post = posts[id];
		if (!(response.success || e.status == 423))
			return W.error(response.reason);
		post.fave = 0;
		W.notice('Post #' + post.id + ' removed from favorites');
		if (isDirectLink) {
			post.faves.innerHTML = W.Favorite.link_to_users(response.favorited_users);
		} else if (response.success) {
			// only update the fave count if it's successful
			post.faves.innerHTML = '♥' + (Number(post.faves.innerHTML.substring(1)) - 1);
		}
		await post.save();
	}

	async function _download(id) {
		await posts[id].download();
	}

	async function _sync() {
		if (!confirm('Are you sure you wish to sync all your faves with the local cache? This may take a while.'))
			return;
		var s = $('#sync-cache');
		s.innerHTML = 'Syncing...';
		var {
			synced,
			deleted
		} = await user.sync();
		await load();
		s.innerHTML = 'Sync';
		alert(`Synced with ${synced} posts and removed ${deleted} deleted items.`);
	}

	async function _saveLocal() {
		await user.export();
	}

	async function _loadLocal() {
		await user.import();
	}

	async function _purge() {
		if (!confirm('Are you sure you wish to clear all cached votes and faves for your account?'))
			return;
		await user.clear();
		await load('purge');
		alert('Cache cleared');
	}

	/* Core functions */

	async function load(evt, data) {
		//console.log('Load triggered by',evt);
		if (user.BUSY)
			return;
		try {
			await user.load(data);
			for (var id in posts)
				posts[id].load();
		} catch (e) {
			console.log('Unable to load:', e);
		}
	}

	async function init() {
		if (isDirectLink) {
			await user.load();
			var id = Number(location.href.match(/post\/show\/(\d+)/)[1]);
			var root = $('#post-score-' + id).parentElement; // li
			var post = new Post(root, id);
			posts[id] = post;
			await post.save();
		} else {
			for (var scoreBar of $a('span.post-score')) {
				var id = Number(scoreBar.parentElement.id.substring(1));
				posts[id] = new Post(scoreBar, id);
			}
			await load();
		}

		window.addEventListener('focus', load);
	}

	/* Cache control setup */

	const syncData = E('span');
	const saveData = E('span');
	const loadData = E('span');
	const purgeData = E('span');
	var container = E('div');
	var title = E('h5');

	container.id = 'msg-controls';

	syncData.innerHTML = 'Sync';
	saveData.innerHTML = 'Save';
	loadData.innerHTML = 'Load';
	purgeData.innerHTML = 'Clear';
	title.innerHTML = GM.info.script.name + ' v' + GM.info.script.version;

	syncData.setAttribute('id', 'sync-cache');
	saveData.setAttribute('id', 'save-cache');
	loadData.setAttribute('id', 'load-cache');
	purgeData.setAttribute('id', 'purge-cache');
	container.setAttribute('id', 'cache-controls');

	syncData.setAttribute('class', 'cache-control');
	saveData.setAttribute('class', 'cache-control');
	loadData.setAttribute('class', 'cache-control');
	purgeData.setAttribute('class', 'cache-control');

	page.bindEvent(syncData, 'onclick', _sync);
	page.bindEvent(saveData, 'onclick', _saveLocal);
	page.bindEvent(loadData, 'onclick', _loadLocal);
	page.bindEvent(purgeData, 'onclick', _purge);

	const dvToggle = E('div');
	const uvToggle = E('div');
	dvToggle.className = 'toggle';
	uvToggle.className = 'toggle';

	const dvCheckbox = E('input');
	dvCheckbox.id = 'toggle-dv-vis';
	dvCheckbox.type = 'checkbox';
	if (hideDownvotedPosts) {
		dvCheckbox.setAttribute('checked', '');
	}
	dvCheckbox.addEventListener('click', function () {
		hideDownvotedPosts = !!dvCheckbox.checked;
		updateVisibility();
	});

	const dvLabel = E('label');
	dvLabel.setAttribute('for', 'toggle-dv-vis');
	dvLabel.textContent = 'Hide downvoted';

	dvToggle.appendChild(dvCheckbox);
	dvToggle.appendChild(dvLabel);

	const uvCheckbox = E('input');
	uvCheckbox.id = 'toggle-uv-vis';
	uvCheckbox.type = 'checkbox';
	if (hideUpvotedPosts) {
		uvCheckbox.setAttribute('checked', '');
	}
	uvCheckbox.addEventListener('click', function () {
		hideUpvotedPosts = !!uvCheckbox.checked;
		updateVisibility();
	});

	const uvLabel = E('label');
	uvLabel.setAttribute('for', 'toggle-uv-vis');
	uvLabel.textContent = 'Hide upvoted';

	uvToggle.appendChild(uvCheckbox);
	uvToggle.appendChild(uvLabel);

	container.appendChild(title);
	container.appendChild(syncData);
	container.appendChild(saveData);
	container.appendChild(loadData);
	container.appendChild(purgeData);
	container.appendChild(dvToggle);
	container.appendChild(uvToggle);

	var nav = $('div.sidebar');
	nav.insertBefore(container, nav.firstElementChild);

	/* Final setup */

	page.injectCSS({
		'#voteup, #votedown, #add-to-favs, #remove-from-favs, #download': {},
		'#voteup:hover': {
			cursor: 'pointer',
			color: 'green'
		},
		'#votedown:hover': {
			cursor: 'pointer',
			color: 'red'
		},
		'#add-to-favs:hover': {
			cursor: 'pointer',
			color: 'green'
		},
		'#remove-from-favs': {
			color: 'green'
		},
		'#remove-from-favs:hover': {
			cursor: 'pointer',
			color: 'red'
		},
		'#download:hover': {
			cursor: 'pointer'
		},
		'span.thumb': {
			height: '220px !important'
		},
		'#cache-controls': {
			height: '100px'
		},
		'.cache-control': {
			margin: '4px 6px 4px 2px'
		},
		'#sync-cache:hover': {
			cursor: 'pointer',
			color: 'green'
		},
		'#save-cache:hover': {
			cursor: 'pointer',
			color: 'green'
		},
		'#load-cache:hover': {
			cursor: 'pointer',
			color: 'green'
		},
		'#purge-cache:hover': {
			cursor: 'pointer',
			color: 'red'
		},
		'input[type=checkbox]': {
			display: 'inline',
			'vertical-align': 'middle'
		},
		'.toggle': {
			display: 'block'
		},
		'.toggle > label': {
			'font-weight': 'normal'
		}
	});
	page.import([_upvote, _downvote, _favorite, _unfavorite, _download, _sync, _saveLocal, _loadLocal, _purge]);

	init();
}(unsafeWindow || window, document));
