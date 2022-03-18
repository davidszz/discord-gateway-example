const { EventEmitter } = require('events');
const WebSocket = require('ws');

const OPCODES = {
  Dispatch: 0,
  Hearbeat: 1,
  Identify: 2,
  PresenceUpdate: 3,
  VoiceStateUpdate: 4,
  Resume: 6,
  Reconnect: 7,
  RequestGuildMembers: 8,
  InvalidSession: 9,
  Hello: 10,
  HearbeatACK: 11,
};

const socket = new WebSocket('wss://gateway.discord.gg/?v=9');
const emitter = new EventEmitter();

/**
 * Cached items
 */
const guilds = new Map();
const members = new Map();

/**
 * @type {{ id: string; username: string; discriminator: string; avatar: string; }}
 */
let user = null;

// Socket events
socket.on('open', () => {
  console.log('[SOCKET] Openned!');
});

socket.on('message', onMessage);

/**
 * @param {ISocketData} data 
 * @param {any[]} rest
 */
async function onMessage(data, ...rest) {
  data &&= JSON.parse(data);

  switch (data.op) {
    case OPCODES.Hello: {
      heartbeat(data.d.heartbeat_interval);
      sendData({
        op: OPCODES.Identify,
        d: {
          token: 'ODgwNTE3NDQ4MzEzNTAzODM1.YSfbxg.ROM3sfBrmMBms-SXktLFnI2oDQ0',
          intents: 131071,
          properties: {
            "$os": "linux",
            "$browser": "disco",
            "device": "disco",
          },
        },
      });
      return;
    }

    case OPCODES.Dispatch: {
      onEvent(data.t, data.d);
      return;
    }
  }
}

/**
 * @param {string} eventName
 * @param {Record<string, any>} data 
 */
async function onEvent(eventName, data) {
  if (eventName === 'READY') {
    if (!user) {
      user = data.user;
    }

    const members = await fetchMembers('880504665807147039');
    console.log(members);
  }

  if (eventName === 'GUILD_MEMBERS_CHUNK') {
    emitter.emit('guildMembersChunk', data);
  }

  if (eventName === 'GUILD_CREATE') {
    guilds.set(data.id, data);
    console.log('[EVENT] New guild with id %s added to cache', data.id);
  }
}

/**
 * Send Hearbeat ACK
 * @param {number} delay 
 */
function heartbeat(delay) {
  return setInterval(() => {
    console.log('[SOCKET] Sending heartbeat ACK ->');
  }, delay).unref();
}

/**
 * Tools to help the socket utilization
 * @param {any} data
 * @param {(err?: Error) => void} cb
 */
function sendData(data, cb) {
  socket.send(JSON.stringify(data), cb);
}

/**
 * Fetch guild members
 * @param {string} guildId 
 * @returns {Promise<Map<string, object>>}
 */
async function fetchMembers(guildId) {
  const chunkNonce = Date.now().toString();

  sendData({
    op: OPCODES.RequestGuildMembers,
    d: {
      guild_id: guildId,
      query: '',
      limit: 0,
      nonce: chunkNonce,
    },
  });

  return new Promise((resolve, reject) => {
    const fetchedMembers = new Map();
    
    const handler = ({ nonce, members: _members, ...chunk }) => {
      timeout.refresh();
      if (nonce !== chunkNonce) return;
      for (const member of _members) {
        fetchedMembers.set(member.user.id, member);
        members.set(member.user.id, member);
      }

      if (_members.size < 1000 || (chunk.chunk_index + 1) === chunk.chunk_count) {
        clearTimeout(timeout);
        emitter.removeListener('guildMembersChunk', handler);
        emitter.setMaxListeners(emitter.getMaxListeners() - 1);
        resolve(fetchedMembers);
      }
    }

    const timeout = setTimeout(() => {
      emitter.removeListener('guildMembersChunk', handler);
      emitter.setMaxListeners(emitter.getMaxListeners() - 1);
      reject(new Error('GUILD_MEMBERS_TIMEOUT'));
    }, 12000).unref();

    emitter.setMaxListeners(emitter.getMaxListeners() + 1);
    emitter.addListener('guildMembersChunk', handler);
  });
}