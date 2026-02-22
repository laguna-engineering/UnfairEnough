import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../slices/gameSlice';
import playersReducer from '../slices/playersSlice';

type StoreState = {
  game: ReturnType<typeof gameReducer>;
  players: ReturnType<typeof playersReducer>;
};

export const createStore = (preloadedState?: StoreState) =>
  configureStore({
    reducer: {
      game: gameReducer,
      players: playersReducer,
    },
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          // WebSocket instances are not serializable
          ignoredActions: ['game/setWebSocket'],
          ignoredPaths: ['game.ws'],
        },
      }),
  });

export type AppStore = ReturnType<typeof createStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
