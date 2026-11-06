# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [1.1.0]

### Corrigido
- Cálculo inverso com curva ("A partir da parcela") não trava mais a tela: roda em Web Worker e cancela cálculos obsoletos.
- Arrastar a curva no modo inverso não dispara mais o solver a cada frame.
- `npm run test:status` agora falha quando a suíte quebra, bloqueando o deploy.

### Alterado
- Resultados recalculam automaticamente após editar os campos (com pequeno atraso).
- Erros de validação aparecem no formulário, em vez de `alert()`.
- Editor da curva tem sliders com valor visível para cada ponto.
- Gráfico ampliado mantém o foco dentro do diálogo e o devolve ao fechar.
- Bundle menor: só os componentes do Chart.js em uso são registrados.

### Interno
- ESLint com regras de React Hooks, executado no CI.
- Valores padrão centralizados em `src/defaults.js`.
