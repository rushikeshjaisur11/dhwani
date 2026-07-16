const sqliteVec = require("sqlite-vec");
const localEmbeddings = require("./localEmbeddings");
const { LocalEmbeddings } = localEmbeddings;
const debugLogger = require("./debugLogger");
const { chunkConversation } = require("./conversationChunker");

// sqlite-vec vec0 tables on the app's existing better-sqlite3 handle.
// Replaces the former Qdrant sidecar (85MB binary, spawned process, port,
// health-check loop). Same public API as before:
//   init / ensureCollection / upsertNote / deleteNote / search / reindexAll /
//   ensureConversationChunksCollection / upsertConversationChunks /
//   deleteConversationChunks / searchConversations / reindexAllConversations /
//   isReady
// Scores stay Qdrant-compatible: cosine similarity = 1 - vec0 cosine distance,
// so the existing 0.3 thresholds in searchNotesTool/searchConversations hold.
//
// Conversation chunk rowid = conversationId * 1000 + chunkIndex (same
// composite scheme as before; replaces the Qdrant payload filter).

const NOTES_TABLE = "vec_notes";
const CHUNKS_TABLE = "vec_conversation_chunks";

function toBlob(vector) {
  const f32 = vector instanceof Float32Array ? vector : new Float32Array(vector);
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
}

class VectorIndex {
  constructor() {
    this.db = null;
  }

  // Takes the existing better-sqlite3 handle (databaseManager.db).
  init(db) {
    sqliteVec.load(db);
    this.db = db;
  }

  ensureCollection() {
    if (!this.db) return Promise.resolve();
    try {
      this.db.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS ${NOTES_TABLE} USING vec0(embedding float[384] distance_metric=cosine)`
      );
    } catch (err) {
      debugLogger.error("Failed to create vec_notes table", { error: err.message });
    }
    return Promise.resolve();
  }

  _upsertRow(table, rowid, vector) {
    // vec0 has no native upsert: delete-by-rowid then insert.
    this.db.prepare(`DELETE FROM ${table} WHERE rowid = ?`).run(BigInt(rowid));
    this.db
      .prepare(`INSERT INTO ${table}(rowid, embedding) VALUES (?, ?)`)
      .run(BigInt(rowid), toBlob(vector));
  }

  async upsertNote(noteId, text) {
    if (!this.db) return;
    try {
      const vector = await localEmbeddings.embedText(text);
      this._upsertRow(NOTES_TABLE, noteId, vector);
    } catch (err) {
      debugLogger.debug("Vector index upsert failed", { noteId, error: err.message });
    }
  }

  async deleteNote(noteId) {
    if (!this.db) return;
    try {
      this.db.prepare(`DELETE FROM ${NOTES_TABLE} WHERE rowid = ?`).run(BigInt(noteId));
    } catch (err) {
      debugLogger.debug("Vector index delete failed", { noteId, error: err.message });
    }
  }

  async search(queryText, limit = 5) {
    if (!this.db) return [];
    try {
      const vector = await localEmbeddings.embedText(queryText);
      const rows = this.db
        .prepare(
          `SELECT rowid, distance FROM ${NOTES_TABLE} WHERE embedding MATCH ? ORDER BY distance LIMIT ?`
        )
        .all(toBlob(vector), limit);
      return rows.map((r) => ({ noteId: Number(r.rowid), score: 1 - r.distance }));
    } catch (err) {
      debugLogger.debug("Vector search failed", { error: err.message });
      return [];
    }
  }

  async reindexAll(notes, onProgress) {
    if (!this.db) return;
    const BATCH_SIZE = 50;
    for (let i = 0; i < notes.length; i += BATCH_SIZE) {
      const batch = notes.slice(i, i + BATCH_SIZE);
      const texts = batch.map((n) =>
        LocalEmbeddings.noteEmbedText(n.title, n.content, n.enhanced_content)
      );
      try {
        const vectors = await localEmbeddings.embedTexts(texts);
        const insertBatch = this.db.transaction(() => {
          batch.forEach((n, j) => this._upsertRow(NOTES_TABLE, n.id, vectors[j]));
        });
        insertBatch();
      } catch (err) {
        debugLogger.debug("Vector reindex batch failed", { offset: i, error: err.message });
      }
      if (onProgress) onProgress(Math.min(i + BATCH_SIZE, notes.length), notes.length);
    }
  }

  ensureConversationChunksCollection() {
    if (!this.db) return Promise.resolve();
    try {
      this.db.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS ${CHUNKS_TABLE} USING vec0(embedding float[384] distance_metric=cosine)`
      );
    } catch (err) {
      debugLogger.error("Failed to create vec_conversation_chunks table", {
        error: err.message,
      });
    }
    return Promise.resolve();
  }

  async upsertConversationChunks(conversationId, title, messages) {
    if (!this.db) return;
    try {
      await this.deleteConversationChunks(conversationId);
      const chunks = chunkConversation(title, messages);
      if (chunks.length === 0) return;

      const texts = chunks.map((c) => c.text);
      const vectors = await localEmbeddings.embedTexts(texts);
      const insertChunks = this.db.transaction(() => {
        chunks.forEach((c, i) => {
          this._upsertRow(CHUNKS_TABLE, conversationId * 1000 + c.chunkIndex, vectors[i]);
        });
      });
      insertChunks();
    } catch (err) {
      debugLogger.debug("Conversation chunks upsert failed", {
        conversationId,
        error: err.message,
      });
    }
  }

  async deleteConversationChunks(conversationId) {
    if (!this.db) return;
    try {
      this.db
        .prepare(`DELETE FROM ${CHUNKS_TABLE} WHERE rowid >= ? AND rowid < ?`)
        .run(BigInt(conversationId * 1000), BigInt((conversationId + 1) * 1000));
    } catch (err) {
      debugLogger.debug("Conversation chunks delete failed", {
        conversationId,
        error: err.message,
      });
    }
  }

  async searchConversations(queryText, limit = 10) {
    if (!this.db) return [];
    try {
      const vector = await localEmbeddings.embedText(queryText);
      const rows = this.db
        .prepare(
          `SELECT rowid, distance FROM ${CHUNKS_TABLE} WHERE embedding MATCH ? ORDER BY distance LIMIT ?`
        )
        .all(toBlob(vector), limit * 3);

      const bestByConversation = new Map();
      for (const r of rows) {
        const score = 1 - r.distance;
        if (score < 0.3) continue;
        const convId = Math.floor(Number(r.rowid) / 1000);
        if (!bestByConversation.has(convId) || score > bestByConversation.get(convId)) {
          bestByConversation.set(convId, score);
        }
      }

      return [...bestByConversation.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([conversationId, score]) => ({ conversationId, score }));
    } catch (err) {
      debugLogger.debug("Conversation search failed", { error: err.message });
      return [];
    }
  }

  async reindexAllConversations(conversations, onProgress) {
    if (!this.db) return;
    const BATCH_SIZE = 50;
    for (let i = 0; i < conversations.length; i += BATCH_SIZE) {
      const batch = conversations.slice(i, i + BATCH_SIZE);
      for (const conv of batch) {
        try {
          await this.upsertConversationChunks(conv.id, conv.title, conv.messages);
        } catch (err) {
          debugLogger.debug("Conversation reindex failed", {
            conversationId: conv.id,
            error: err.message,
          });
        }
      }
      if (onProgress)
        onProgress(Math.min(i + BATCH_SIZE, conversations.length), conversations.length);
    }
  }

  // One-time migration from the Qdrant era: vec tables start empty even
  // though notes exist — re-embed everything locally (cheap, no data loss).
  needsMigration(noteCount) {
    if (!this.db || noteCount === 0) return false;
    const { c } = this.db.prepare(`SELECT COUNT(*) c FROM ${NOTES_TABLE}`).get();
    return c === 0;
  }

  isReady() {
    return this.db !== null;
  }
}

module.exports = new VectorIndex();
