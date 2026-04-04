/**
 * Client networking layer for server-authoritative multiplayer.
 * Sends inputs to server, receives authoritative snapshots.
 * Supports client-side prediction with server reconciliation.
 */
import PartySocket from 'partysocket';

const PARTYKIT_HOST =
  import.meta.env.VITE_PARTYKIT_HOST || 'localhost:1999';

/** Max pending inputs to keep for reconciliation */
const MAX_PENDING = 120;

export class NetworkClient {
  /** @type {PartySocket | null} */
  ws = null;
  localId = null;
  connected = false;

  /** @type {Map<string, object>} */
  remotePlayers = new Map();

  /** Sequence counter for inputs */
  seq = 0;
  /** Pending inputs not yet confirmed by server (for reconciliation) */
  pendingInputs = [];

  /** Latest server-confirmed state for the local player */
  serverState = null;
  /** Latest server seq ack for the local player */
  serverSeq = -1;

  /** RTT in ms (smoothed) */
  ping = 0;
  /** Maps seq -> send timestamp for RTT measurement */
  _sendTimes = new Map();

  /** @type {((event: {type: string, [k:string]: any}) => void)[]} */
  listeners = [];

  constructor(roomId = 'default') {
    this.roomId = roomId;
  }

  connect() {
    this.ws = new PartySocket({
      host: PARTYKIT_HOST,
      room: this.roomId,
      party: 'main',
    });

    this.ws.addEventListener('message', (e) => {
      this._handleMessage(JSON.parse(e.data));
    });

    this.ws.addEventListener('open', () => {
      this.connected = true;
      console.log('[net] connected to room:', this.roomId);
    });

    this.ws.addEventListener('close', () => {
      this.connected = false;
      this.localId = null;
      console.log('[net] disconnected');
    });
  }

  /**
   * Send an input to the server and store it for reconciliation.
   * @param {{ moveX: number, moveZ: number, sprint: boolean, jump: boolean, crouch: boolean, rotation: number }} input
   * @returns {number} seq number of this input
   */
  sendInput(input) {
    const seq = this.seq++;
    const msg = { type: 'input', ...input, seq };

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }

    this._sendTimes.set(seq, performance.now());
    // Prune old entries
    if (this._sendTimes.size > 150) {
      const oldest = this._sendTimes.keys().next().value;
      this._sendTimes.delete(oldest);
    }

    this.pendingInputs.push({ ...input, seq });
    if (this.pendingInputs.length > MAX_PENDING) {
      this.pendingInputs.shift();
    }

    return seq;
  }

  on(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  _handleMessage(data) {
    switch (data.type) {
      case 'init':
        this.localId = data.id;
        for (const [id, player] of Object.entries(data.players)) {
          if (id !== this.localId) {
            this.remotePlayers.set(id, player);
          }
        }
        // Store initial local state
        if (data.players[this.localId]) {
          this.serverState = data.players[this.localId];
          this.serverSeq = -1;
        }
        break;

      case 'snapshot': {
        // Update local authoritative state
        const localData = data.players?.[this.localId];
        if (localData) {
          this.serverState = localData;
          const ackedSeq = data.seqs?.[this.localId] ?? -1;
          this.serverSeq = ackedSeq;
          // Measure RTT from the acked input's send time
          const sentAt = this._sendTimes.get(ackedSeq);
          if (sentAt !== undefined) {
            const rtt = performance.now() - sentAt;
            this.ping = this.ping === 0 ? rtt : this.ping * 0.8 + rtt * 0.2;
            // Clean up measured entries
            for (const key of this._sendTimes.keys()) {
              if (key <= ackedSeq) this._sendTimes.delete(key);
            }
          }
          // Discard inputs already processed by the server
          this.pendingInputs = this.pendingInputs.filter((i) => i.seq > this.serverSeq);
        }

        // Update remote players
        for (const [id, player] of Object.entries(data.players)) {
          if (id !== this.localId) {
            this.remotePlayers.set(id, player);
          }
        }
        for (const id of this.remotePlayers.keys()) {
          if (!(id in data.players)) {
            this.remotePlayers.delete(id);
          }
        }
        break;
      }

      case 'player-joined':
        if (data.player.id !== this.localId) {
          this.remotePlayers.set(data.player.id, data.player);
        }
        break;

      case 'player-left':
        this.remotePlayers.delete(data.id);
        break;
    }

    for (const fn of this.listeners) fn(data);
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }
}
