## Tarefa agora: correção pontual

A aula já foi escrita e passou por uma conferência automática. A mensagem a seguir lista **somente os itens que falharam**. Devolva o JSON de correção:

- `objetivo`: o novo objetivo, só se o objetivo foi apontado como problema; senão `null`.
- `pre_teste`: o pré-teste completo (2 ou 3 perguntas com resposta), só se foi apontado; senão `null`.
- `blocos`: um item por bloco apontado, com `indice` igual ao da lista. Em `referencias`, devolva a lista **completa** do bloco, na ordem dos marcadores [1], [2]… do texto, usando apenas `fonte_id` e `trecho_id` da lista de fontes e trechos disponíveis (ou uma obra conhecida em `citacao`, com `fonte_id` e `trecho_id` nulos). Em `perguntas_recuperacao`, 1 ou 2 perguntas com resposta, se foram apontadas; senão `null`.
- `cartoes`: a lista completa de 3 a 8 cartões (um conceito por cartão, pelo menos um de "por quê?"), só se os cartões foram apontados; senão `null`.

Não mude nada que não foi apontado. Nunca escreva URLs.
