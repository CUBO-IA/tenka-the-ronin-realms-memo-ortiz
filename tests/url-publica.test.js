import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { basePublica, esHostLocal } from '../server/app.js';

describe('URL pública del sello del QR', () => {
  test('usa URL_PUBLICA cuando está definida y quita la barra final', () => {
    assert.equal(
      basePublica({
        protocolo: 'https',
        host: 'localhost:3000',
        urlPublica: 'https://tenka.example/',
        ip: '192.168.1.5',
      }),
      'https://tenka.example',
    );
  });

  test('cambia localhost por la IP de la red local', () => {
    assert.equal(
      basePublica({
        protocolo: 'http',
        host: 'localhost:3000',
        urlPublica: '',
        ip: '192.168.40.232',
      }),
      'http://192.168.40.232:3000',
    );
  });

  test('también cambia 127.0.0.1 y conserva el puerto', () => {
    assert.equal(
      basePublica({
        protocolo: 'http',
        host: '127.0.0.1:3000',
        urlPublica: '',
        ip: '10.0.0.7',
      }),
      'http://10.0.0.7:3000',
    );
  });

  test('respeta un host que ya es de red', () => {
    assert.equal(
      basePublica({
        protocolo: 'http',
        host: '192.168.40.232:3000',
        urlPublica: '',
        ip: '10.0.0.7',
      }),
      'http://192.168.40.232:3000',
    );
  });

  test('si no hay IP local, deja el host original', () => {
    assert.equal(
      basePublica({
        protocolo: 'http',
        host: 'localhost:3000',
        urlPublica: '',
        ip: null,
      }),
      'http://localhost:3000',
    );
  });

  test('reconoce los hosts locales', () => {
    assert.equal(esHostLocal('localhost:3000'), true);
    assert.equal(esHostLocal('127.0.0.1:3000'), true);
    assert.equal(esHostLocal('[::1]:3000'), true);
    assert.equal(esHostLocal('192.168.0.2:3000'), false);
  });
});
