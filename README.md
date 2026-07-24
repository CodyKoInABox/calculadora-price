# Calculadora PRICE Avançada

Simulador **gratuito** e **open source** (MIT) de financiamento pela Tabela Price — com curva interativa de parcelas e balões.

**Usar online:** https://CodyKoInABox.github.io/calculadora-price/

Criado por [CodyKoInABox](https://github.com/CodyKoInABox).

## Recursos

- Price tradicional e curva de parcelas editável
- Balões em meses específicos
- Comparação Price × SAC e cenários A vs B
- Gráficos, tabela de amortização, export CSV e PDF
- Share link com estado na URL (`?pv=&dp=&n=...`) — sem backend
- 100% no navegador — sem cadastro

## Dev

```bash
npm install
npm run dev
```

## Testes

```bash
npm run test:run
```

Atualiza o badge compacto da UI (`src/test-status.json`):

```bash
npm run test:status
```

O CI roda os testes antes do build/deploy (`.github/workflows/deploy.yml`).

## Build

```bash
npm run build
npm run preview
```

## Licença

[MIT](LICENSE) — use, copie, modifique e redistribua livremente.

## Contribuir

Issues e PRs são bem-vindos em https://github.com/CodyKoInABox/calculadora-price.
