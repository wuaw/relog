const S = require('./string')

module.exports = function Relog(dispatch) {

	dispatch.hook('C_WHISPER', 1, chatHook)
	dispatch.hook('C_CHAT', 1, chatHook)

	function chatHook(event) {
		const args = S.decodeHTMLEntities(S.stripTags(event.message))
			.split(/\s+/)
		const name = args.reduce((out, part) => {
			if (part.toLowerCase() === '!relog') return true
			if (out === true) return part
			return out
		}, false)

		if (name) {
			relogByName(name)
			return false
		}
	}

	function relogByName(name) {
		if (!name) return
		getCharacterId(name)
			.then(relog)
			.catch(e => console.error(e.message))
	}

	function getCharacterId(name) {
		return new Promise((resolve, reject) => {
			// request handler, resolves with character's playerId
			const userListHook = hookNext('S_GET_USER_LIST', 1, event => {
				event.characters.forEach(char => {
					if (char.name.toLowerCase() === name.toLowerCase())
						resolve(char.id)
				})
				reject(new Error(`[fast-relog] character "${name}" not found`))
			})

			// set a timeout for the request, in case something went wrong
			setTimeout(() => {
				if (userListHook) dispatch.unhook(userListHook)
				reject(new Error('[fast-relog] C_GET_USER_LIST request timed out'))
			}, 5000)

			// request the character list
			dispatch.toServer('C_GET_USER_LIST', 1, {})
		})
	}

	function relog(targetId) {
		if (!targetId) return
		dispatch.toServer('C_RETURN_TO_LOBBY', 1, {})
		dispatch.toClient('S_RETURN_TO_LOBBY', 1, {})

		// the server is not ready yet, displaying "Loading..." as char names
		const userListHook = hookNext('S_GET_USER_LIST', 1, event => {
			event.characters.forEach(char => char.name = 'Loading...')
			return true
		})

		// the server is ready to relog to a new character
		const lobbyHook = hookNext('S_RETURN_TO_LOBBY', 1, event => {
			dispatch.toServer('C_SELECT_USER', 1, { id: targetId, unk: 0 })
		})

		// hook timeout, in case something goes wrong
		setTimeout(() => {
			for (const hook of [lobbyHook, userListHook])
				if (hook) dispatch.unhook(hook)
		}, 15000)
	}

	function hookNext(...args) {
		const cb = args.pop()
		let hook
		return hook = dispatch.hook(...args, (...cbArgs) => {
			dispatch.unhook(hook)
			return cb(...cbArgs)
		})
	}

	// slash support
	try {
		const Slash = require('slash')
		const slash = new Slash(dispatch)
		slash.on('relog', args => args[1] ? relogByName(args[1]) : false)
	} catch (e) {
		// do nothing because slash is optional
	}
}
