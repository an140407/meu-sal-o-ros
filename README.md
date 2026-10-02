# Meu Salão Rosé

Crie um app web mobile-first (pt-BR, moeda R$) para uma nail designer registrar clientes e atendimentos. Visual limpo, tons rosé/neutros, botões grandes, navegação por barra inferior. Use Supabase com login email/senha (usuário único) e RLS por user_id em todas as tabelas. Não implemente agenda, fotos, estoque nem notificações.

TABELAS

- clientes: id, user_id, nome, telefone, data_nascimento (opcional), consentimento_lgpd (bool), consentimento_data, alergias (texto), gestante (bool), diabetes_circulacao (bool), problema_unhas (texto), medicamentos (texto), observacoes (texto), created_at

- servicos: id, user_id, nome, preco_padrao, ativo. Seed inicial: Esmaltação em gel (0), Manutenção de fibra (100), Manutenção de blindagem (70), Colocação de fibra (150), Blindagem (100)

- configuracoes: user_id, percentual_ana (padrão 70), taxa_debito (padrão 0), taxa_credito (padrão 0), nome_dona (padrão "Simone")

- atendimentos: id, user_id, cliente_id, servico_id, data, valor_bruto, forma_pagamento (pix|dinheiro|debito|credito), taxa_percentual (preenchida a partir das configurações; 0 para pix/dinheiro), valor_liquido (= valor_bruto × (1 − taxa/100)), percentual_ana (copiado das configurações no momento do registro), observacoes

TELAS

1. Atendimentos: lista agrupada por mês, botão "+ Novo atendimento". No formulário: escolher cliente (com opção de criar rápido), escolher serviço (preenche o valor, editável), data (padrão hoje), forma de pagamento. Permitir editar e excluir.

2. Clientes: busca por nome, lista, ficha com anamnese editável e histórico de atendimentos. No cadastro, checkbox obrigatório de consentimento: "A cliente autoriza o armazenamento dos dados de saúde para fins de atendimento".

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d24a8d8d-6e70-4957-ae70-90af1fd80817).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
