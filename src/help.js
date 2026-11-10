// Conteúdo do menu de ajuda. Cada item descreve um campo, modo ou resultado da tela.
export const HELP_SECTIONS = [
  {
    id: 'comecar',
    title: 'Como começar',
    items: [
      {
        term: 'Passo a passo',
        text: 'Preencha o valor do bem, a entrada, os juros e o prazo. O resultado aparece ao lado e se atualiza sozinho depois de uma pausa. O botão "Calcular financiamento" força um novo cálculo.'
      },
      {
        term: 'Link da simulação',
        text: '"Copiar link" gera um endereço com toda a configuração. Quem abrir o link vê a mesma simulação.'
      }
    ]
  },
  {
    id: 'campos',
    title: 'Os campos',
    items: [
      {
        term: 'Calcular parcela ou A partir da parcela',
        text: '"Calcular parcela" mostra a parcela do financiamento que você descreveu. "A partir da parcela" faz o caminho inverso: você informa a parcela máxima que cabe no orçamento e a calculadora mostra quanto dá para financiar ou qual é a entrada mínima.'
      },
      {
        term: 'Valor total do bem',
        text: 'Preço do imóvel ou do bem. O valor financiado é o valor total menos a entrada.'
      },
      {
        term: 'Entrada',
        text: 'Valor pago à vista. Quanto maior a entrada, menor o valor financiado.'
      },
      {
        term: 'Juros',
        text: 'Taxa do financiamento, em mês ou em ano. A taxa anual é convertida para a mensal equivalente (juros compostos), e não dividida por 12. O campo mostra a equivalente abaixo.'
      },
      {
        term: 'Prazo',
        text: 'Número de meses do financiamento, de 1 a 600.'
      },
      {
        term: '1º vencimento',
        text: 'Mês da primeira parcela. Serve só para as datas da tabela de amortização.'
      },
      {
        term: 'Parcela regular máxima',
        text: 'Usado em "A partir da parcela". Pagamentos extras não entram nesse limite.'
      },
      {
        term: 'Calcular pela renda',
        text: 'Informe a renda bruta mensal e escolha 25%, 30% ou 35%. O valor resultante vira a parcela máxima.'
      }
    ]
  },
  {
    id: 'modelos',
    title: 'Modelos de parcela',
    items: [
      {
        term: 'Price',
        text: 'Parcelas iguais do início ao fim. No começo, a maior parte da parcela é juros; ao longo do tempo, a amortização cresce.'
      },
      {
        term: 'Curva',
        text: 'Você desenha se as parcelas sobem ou descem no prazo. Os presets (Crescente, Sobe e desce, Rápido → suave, Suave → rápido) são pontos de partida. O financiamento sempre quita o saldo no prazo.'
      },
      {
        term: 'Price × SAC',
        text: 'Compara as duas tabelas com o mesmo valor, taxa e prazo. Na SAC, a amortização é igual todo mês, então a primeira parcela é maior e os juros totais costumam ser menores.'
      },
      {
        term: 'A vs B',
        text: 'Compara dois cenários independentes, cada um com entrada, prazo, juros e extras próprios. "Copiar A → B" duplica o cenário A.'
      },
      {
        term: 'SACRE',
        text: 'Opção dentro da Price (cálculo direto). A parcela é recalculada a cada 12 meses sobre o saldo devedor. Com uma taxa de correção (TR) preenchida, o saldo é corrigido todo mês antes dos juros.'
      }
    ]
  },
  {
    id: 'resultados',
    title: 'O que significa cada resultado',
    items: [
      {
        term: 'Valor financiado',
        text: 'Valor total do bem menos a entrada. É a base de cálculo dos juros.'
      },
      {
        term: 'Primeira e última parcela regular',
        text: 'Valor da primeira e da última parcela, sem contar os pagamentos extras.'
      },
      {
        term: 'Total pago',
        text: 'Entrada, mais todas as parcelas regulares, mais os pagamentos extras.'
      },
      {
        term: 'Juros totais',
        text: 'Soma dos juros de todos os meses do financiamento.'
      },
      {
        term: 'CET (custo efetivo total)',
        text: 'Taxa anual que iguala o valor recebido aos pagamentos, somando seguros e taxas informados. Sem custos, ela é a própria taxa contratada.'
      },
      {
        term: 'Seguros e taxas',
        text: 'Soma das tarifas iniciais, da taxa de administração, do MIP e do DFI calculados mês a mês.'
      },
      {
        term: 'Correção TR acumulada',
        text: 'Total das correções aplicadas ao saldo no SACRE. Aparece só quando há TR.'
      },
      {
        term: 'Saldo devedor',
        text: 'Quanto ainda falta pagar depois do pagamento de cada mês.'
      },
      {
        term: 'Desembolso total',
        text: 'Parcela regular mais pagamento extra no mês. É o valor que sai do seu bolso naquele mês.'
      },
      {
        term: 'Piso de juros',
        text: 'Aparece quando a parcela de um mês da curva é menor que os juros do mês. Para não gerar amortização negativa, a parcela é elevada até o valor dos juros.'
      }
    ]
  },
  {
    id: 'extras',
    title: 'Pagamentos extras',
    items: [
      {
        term: 'Recorrência',
        text: 'Único (um mês), todo mês, todo ano ou a cada N meses. Em recorrências, o "início" é o primeiro mês do pagamento.'
      },
      {
        term: 'Reduzir parcela',
        text: 'Os extras amortizam o saldo e a parcela cai, de modo que o financiamento seja quitado no prazo contratado.'
      },
      {
        term: 'Reduzir prazo',
        text: 'Os extras amortizam o saldo, a parcela contratada continua igual e o financiamento termina antes.'
      }
    ]
  },
  {
    id: 'custos',
    title: 'Seguros e taxas',
    intro: 'Esses valores entram só no CET. A parcela não muda.',
    items: [
      {
        term: 'Tarifas iniciais',
        text: 'Avaliação, registro e cartório. Pagas uma vez.'
      },
      {
        term: 'Taxa de administração',
        text: 'Valor fixo pago todo mês.'
      },
      {
        term: 'MIP',
        text: 'Seguro por morte e invalidez, em % ao mês sobre o saldo devedor. Diminui conforme o saldo cai.'
      },
      {
        term: 'DFI',
        text: 'Seguro de danos ao imóvel, em % ao ano sobre o valor do bem.'
      }
    ]
  },
  {
    id: 'cenarios',
    title: 'Cenários, comparação e exportação',
    items: [
      {
        term: 'Cenários salvos',
        text: 'Guardam a configuração no próprio navegador, com um nome. Marque de 2 a 4 para comparar lado a lado.'
      },
      {
        term: 'Importar e exportar JSON',
        text: 'Leva os cenários salvos para outro computador ou navegador.'
      },
      {
        term: 'Exportar CSV e PDF',
        text: 'Gera a tabela de amortização. O PDF inclui o resumo e a tabela no cálculo direto, e os indicadores lado a lado nas comparações.'
      }
    ]
  },
  {
    id: 'limites',
    title: 'Limites da simulação',
    items: [
      {
        term: 'Simulação estimativa',
        text: 'Não inclui correção monetária além da TR informada, impostos, nem custos que não foram preenchidos. Não substitui a análise de um profissional nem a proposta de uma instituição financeira.'
      }
    ]
  }
]
