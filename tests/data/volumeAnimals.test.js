import { describe, test, expect } from 'vitest';
import { VOLUME_ANIMALS, getVolumeAnimal } from '../../src/data/volumeAnimals.js';

describe('VOLUME_ANIMALS table', () => {
  test('every entry has lbs, emoji, and name', () => {
    VOLUME_ANIMALS.forEach(a => {
      expect(typeof a.lbs).toBe('number');
      expect(typeof a.emoji).toBe('string');
      expect(typeof a.name).toBe('string');
      expect(a.name.length).toBeGreaterThan(0);
    });
  });

  test('entries are in ascending lbs order with 500-lb steps', () => {
    for (let i = 1; i < VOLUME_ANIMALS.length; i++) {
      expect(VOLUME_ANIMALS[i].lbs).toBe(VOLUME_ANIMALS[i - 1].lbs + 500);
    }
  });
});

describe('getVolumeAnimal', () => {
  test('rounds to nearest 500', () => {
    expect(getVolumeAnimal(3200).lbs).toBe(3000);
    expect(getVolumeAnimal(3300).lbs).toBe(3500);
    expect(getVolumeAnimal(3250).lbs).toBe(3500); // ties round up
  });

  test('clamps below minimum to 1500', () => {
    expect(getVolumeAnimal(0).lbs).toBe(1500);
    expect(getVolumeAnimal(500).lbs).toBe(1500);
    expect(getVolumeAnimal(1400).lbs).toBe(1500);
  });

  test('clamps above maximum to 30000', () => {
    expect(getVolumeAnimal(40000).lbs).toBe(30000);
    expect(getVolumeAnimal(30001).lbs).toBe(30000);
  });

  test('returns exact match for a value already on a 500-lb boundary', () => {
    expect(getVolumeAnimal(5000).lbs).toBe(5000);
    expect(getVolumeAnimal(10000).lbs).toBe(10000);
  });

  test('returned entry exists in VOLUME_ANIMALS', () => {
    const animal = getVolumeAnimal(7300);
    expect(VOLUME_ANIMALS.some(a => a.lbs === animal.lbs)).toBe(true);
  });
});
