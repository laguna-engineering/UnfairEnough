import { createSlice, createEntityAdapter, PayloadAction } from '@reduxjs/toolkit';

export interface Player {
  id: string;
  name: string;
  color: string;
  score: number;
  isConnected: boolean;
}

const playersAdapter = createEntityAdapter<Player>({
  selectId: (player) => player.id,
  sortComparer: (a, b) => b.score - a.score, // Sort by score descending
});

const playersSlice = createSlice({
  name: 'players',
  initialState: playersAdapter.getInitialState(),
  reducers: {
    addPlayer: playersAdapter.addOne,

    removePlayer: playersAdapter.removeOne,

    updateScore(state, action: PayloadAction<{ id: string; score: number }>) {
      playersAdapter.updateOne(state, {
        id: action.payload.id,
        changes: { score: action.payload.score },
      });
    },

    addPoints(state, action: PayloadAction<{ id: string; points: number }>) {
      const player = state.entities[action.payload.id];
      if (player) {
        playersAdapter.updateOne(state, {
          id: action.payload.id,
          changes: { score: player.score + action.payload.points },
        });
      }
    },

    setPlayerConnected(state, action: PayloadAction<{ id: string; isConnected: boolean }>) {
      playersAdapter.updateOne(state, {
        id: action.payload.id,
        changes: { isConnected: action.payload.isConnected },
      });
    },

    clearPlayers: playersAdapter.removeAll,

    resetScores(state) {
      const updates = state.ids.map((id) => ({
        id: id as string,
        changes: { score: 0 },
      }));
      playersAdapter.updateMany(state, updates);
    },
  },
});

export const {
  addPlayer,
  removePlayer,
  updateScore,
  addPoints,
  setPlayerConnected,
  clearPlayers,
  resetScores,
} = playersSlice.actions;

// Export selectors
export const playersSelectors = playersAdapter.getSelectors();

export default playersSlice.reducer;
