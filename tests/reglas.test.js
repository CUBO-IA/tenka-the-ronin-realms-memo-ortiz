import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  infoEdificio,
  recursosDeBando,
  recursosRecolectables,
  reglas,
  siguienteEtapa,
} from '../server/reglas.js';

describe('reglas del juego y era 1', () => {
  test('recursos iniciales definidos para ambos bandos', () => {
    assert.ok(reglas.recursosIniciales.luz.cedro > 0 && reglas.recursosIniciales.luz.mon >= 0);
    assert.ok(reglas.recursosIniciales.sombra.sauce > 0 && reglas.recursosIniciales.sombra.mon >= 0);
  });

  test('recursos de cada bando según el diseño', () => {
    assert.deepEqual(recursosDeBando('luz'), ['cedro', 'piedra', 'hierro', 'arroz', 'mon']);
    assert.deepEqual(recursosDeBando('sombra'), ['sauce', 'lodo', 'hongos', 'arroz', 'mon']);
    assert.deepEqual(recursosRecolectables('luz'), ['cedro', 'piedra', 'hierro', 'arroz']);
    assert.deepEqual(recursosRecolectables('sombra'), ['sauce', 'lodo', 'hongos', 'arroz']);
  });

  test('progresión de etapas de los edificios', () => {
    assert.equal(siguienteEtapa(null), 'cimientos');
    assert.equal(siguienteEtapa('cimientos'), 'construccion');
    assert.equal(siguienteEtapa('construccion'), 'terminado');
    assert.equal(siguienteEtapa('terminado'), null);
  });

  test('edificios de era 1 tienen costos y duraciones para cada etapa', () => {
    const casa = infoEdificio('luz', 'casa');
    assert.ok(casa);
    assert.ok(casa.etapas.cimientos.costo.cedro);
    assert.ok(casa.etapas.construccion.duracionMs);
    assert.ok(casa.etapas.terminado.costo.hierro);

    const choza = infoEdificio('sombra', 'choza');
    assert.ok(choza);
    assert.ok(choza.etapas.cimientos.costo.sauce);
    assert.ok(choza.etapas.terminado.costo.hongos);
  });
});
