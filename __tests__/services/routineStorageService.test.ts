import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  loadRoutines,
  saveRoutines,
  getRoutine,
  saveRoutine,
  deleteRoutine,
  slugify,
} from '../../src/services/routineStorageService';

import { ROUTINES_KEY as STORAGE_KEY, ROUTINES_SEEDED_KEY as SEEDED_KEY } from '../../src/config/storageKeys';

describe('routineStorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('slugify', () => {
    it('should convert a simple name to lowercase with underscores', () => {
      expect(slugify('Good Morning')).toBe('good_morning');
    });

    it('should handle multiple spaces', () => {
      expect(slugify('My   Custom   Routine')).toBe('my_custom_routine');
    });

    it('should strip special characters', () => {
      expect(slugify('Hello, World!')).toBe('hello_world');
    });

    it('should strip leading and trailing underscores', () => {
      expect(slugify('  --Hello--  ')).toBe('hello');
    });

    it('should handle already slugified input', () => {
      expect(slugify('good_morning')).toBe('good_morning');
    });

    it('should handle mixed case with numbers', () => {
      expect(slugify('Step 1: Do Thing')).toBe('step_1_do_thing');
    });

    it('should collapse consecutive special characters into one underscore', () => {
      expect(slugify('foo---bar___baz')).toBe('foo_bar_baz');
    });

    it('should handle empty string after trimming', () => {
      expect(slugify('   ')).toBe('');
    });
  });

  describe('loadRoutines', () => {
    it('should seed default routines on first load (no seeded key)', async () => {
      // No seeded key exists
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const routines = await loadRoutines();

      // Should have saved defaults
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        expect.any(String),
      );
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(SEEDED_KEY, '1');

      // Should return default routines
      expect(routines.length).toBeGreaterThan(0);
      expect(routines.some((r) => r.id === 'good_morning')).toBe(true);
      expect(routines.some((r) => r.id === 'good_night')).toBe(true);
    });

    it('should return saved routines on subsequent loads', async () => {
      const savedRoutines = [
        {
          id: 'custom_1',
          name: 'Custom',
          trigger_phrases: ['custom'],
          steps: [],
          response_instruction: 'test',
          response_length: 'short',
          background: null,
        },
      ];

      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce('1') // seeded key exists
        .mockResolvedValueOnce(JSON.stringify(savedRoutines)); // storage key

      const routines = await loadRoutines();

      expect(routines).toEqual(savedRoutines);
      // Should NOT have written defaults
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('should return empty array when storage has no routines data after seeding', async () => {
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce('1') // seeded key exists
        .mockResolvedValueOnce(null); // no routines stored

      const routines = await loadRoutines();

      expect(routines).toEqual([]);
    });

    it('should return empty array on JSON parse error', async () => {
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce('1') // seeded key exists
        .mockResolvedValueOnce('not valid json {{{'); // corrupted data

      const routines = await loadRoutines();

      expect(routines).toEqual([]);
    });
  });

  describe('saveRoutines', () => {
    it('should save routines array to AsyncStorage', async () => {
      const routines = [
        {
          id: 'test_1',
          name: 'Test 1',
          trigger_phrases: ['test'],
          steps: [],
          response_instruction: '',
          response_length: 'short' as const,
          background: null,
        },
      ];

      await saveRoutines(routines);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        JSON.stringify(routines),
      );
    });

    it('should save empty array', async () => {
      await saveRoutines([]);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEY,
        '[]',
      );
    });
  });

  describe('getRoutine', () => {
    const mockRoutines = [
      {
        id: 'good_morning',
        name: 'Good Morning',
        trigger_phrases: ['good morning'],
        steps: [],
        response_instruction: 'greet',
        response_length: 'short',
        background: null,
      },
      {
        id: 'good_night',
        name: 'Good Night',
        trigger_phrases: ['good night'],
        steps: [],
        response_instruction: 'farewell',
        response_length: 'short',
        background: null,
      },
    ];

    it('should find a routine by id', async () => {
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce('1') // seeded
        .mockResolvedValueOnce(JSON.stringify(mockRoutines));

      const routine = await getRoutine('good_morning');

      expect(routine).toBeDefined();
      expect(routine?.id).toBe('good_morning');
      expect(routine?.name).toBe('Good Morning');
    });

    it('should return undefined for missing id', async () => {
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce('1')
        .mockResolvedValueOnce(JSON.stringify(mockRoutines));

      const routine = await getRoutine('nonexistent');

      expect(routine).toBeUndefined();
    });
  });

  describe('saveRoutine', () => {
    const existingRoutines = [
      {
        id: 'routine_1',
        name: 'Routine 1',
        trigger_phrases: ['one'],
        steps: [],
        response_instruction: 'first',
        response_length: 'short' as const,
        background: null,
      },
    ];

    it('should update an existing routine by id', async () => {
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce('1') // seeded
        .mockResolvedValueOnce(JSON.stringify(existingRoutines));

      const updated = {
        ...existingRoutines[0],
        name: 'Updated Routine 1',
        response_instruction: 'updated',
      };

      await saveRoutine(updated);

      const savedArg = (AsyncStorage.setItem as jest.Mock).mock.calls.find(
        (call: string[]) => call[0] === STORAGE_KEY,
      );
      expect(savedArg).toBeDefined();
      const savedRoutines = JSON.parse(savedArg![1]);
      expect(savedRoutines).toHaveLength(1);
      expect(savedRoutines[0].name).toBe('Updated Routine 1');
      expect(savedRoutines[0].response_instruction).toBe('updated');
    });

    it('should add a new routine when id does not exist', async () => {
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce('1') // seeded
        .mockResolvedValueOnce(JSON.stringify(existingRoutines));

      const newRoutine = {
        id: 'routine_2',
        name: 'Routine 2',
        trigger_phrases: ['two'],
        steps: [],
        response_instruction: 'second',
        response_length: 'short' as const,
        background: null,
      };

      await saveRoutine(newRoutine);

      const savedArg = (AsyncStorage.setItem as jest.Mock).mock.calls.find(
        (call: string[]) => call[0] === STORAGE_KEY,
      );
      expect(savedArg).toBeDefined();
      const savedRoutines = JSON.parse(savedArg![1]);
      expect(savedRoutines).toHaveLength(2);
      expect(savedRoutines[1].id).toBe('routine_2');
    });
  });

  describe('deleteRoutine', () => {
    it('should remove a routine by id', async () => {
      const routines = [
        {
          id: 'keep_me',
          name: 'Keep',
          trigger_phrases: [],
          steps: [],
          response_instruction: '',
          response_length: 'short',
          background: null,
        },
        {
          id: 'delete_me',
          name: 'Delete',
          trigger_phrases: [],
          steps: [],
          response_instruction: '',
          response_length: 'short',
          background: null,
        },
      ];

      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce('1') // seeded
        .mockResolvedValueOnce(JSON.stringify(routines));

      await deleteRoutine('delete_me');

      const savedArg = (AsyncStorage.setItem as jest.Mock).mock.calls.find(
        (call: string[]) => call[0] === STORAGE_KEY,
      );
      expect(savedArg).toBeDefined();
      const savedRoutines = JSON.parse(savedArg![1]);
      expect(savedRoutines).toHaveLength(1);
      expect(savedRoutines[0].id).toBe('keep_me');
    });

    it('should be a no-op when id does not exist', async () => {
      const routines = [
        {
          id: 'only_one',
          name: 'Only',
          trigger_phrases: [],
          steps: [],
          response_instruction: '',
          response_length: 'short',
          background: null,
        },
      ];

      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce('1')
        .mockResolvedValueOnce(JSON.stringify(routines));

      await deleteRoutine('nonexistent');

      const savedArg = (AsyncStorage.setItem as jest.Mock).mock.calls.find(
        (call: string[]) => call[0] === STORAGE_KEY,
      );
      expect(savedArg).toBeDefined();
      const savedRoutines = JSON.parse(savedArg![1]);
      expect(savedRoutines).toHaveLength(1);
      expect(savedRoutines[0].id).toBe('only_one');
    });
  });
});
