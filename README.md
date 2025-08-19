# Dump Processor

Processador de dumps PostgreSQL para geração de scripts de inserção de dados.

## Descrição

Este projeto contém dois scripts para processar dumps PostgreSQL e gerar scripts de inserção de dados:

- **`extract_inserts.js`** - Versão básica com funcionalidades essenciais
- **`extract_inserts_advanced.js`** - Versão avançada com tratamento robusto de tipos de dados

## Problemas Corrigidos

### ✅ Erro SQL COALESCE com tipos incompatíveis

**Problema:** O erro `COALESCE types integer[] and integer cannot be matched` ocorria porque:
- `pg_get_serial_sequence()` retorna um array de strings (`text[]`)
- O cast para `text` não resolvia completamente o problema de tipos
- O COALESCE tentava comparar tipos incompatíveis

**Solução:** Implementação de bloco PL/pgSQL robusto:
```sql
DO $$
DECLARE
    seq_name text;
    max_val bigint;
BEGIN
    seq_name := pg_get_serial_sequence('tabela', 'coluna');
    IF seq_name IS NOT NULL THEN
        SELECT COALESCE(MAX(coluna), 1) INTO max_val FROM tabela;
        EXECUTE format('SELECT setval(%L, %s)', seq_name, max_val);
    END IF;
END $$;
```

### ✅ Erro SQL coluna inexistente

**Problema:** O erro `column "bnccIds" of relation "LessonPlans" does not exist` ocorria porque:
- O script tentava acessar colunas que não existiam na tabela
- Colunas com nomes especiais (aspas duplas) não eram tratadas corretamente
- Não havia verificação de existência da coluna antes de tentar ajustar sequences

**Solução:** Verificação robusta de existência de colunas:
```sql
DO $$
DECLARE
    seq_name text;
    max_val bigint;
    col_exists boolean;
BEGIN
    -- Verificar se a coluna existe na tabela
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = split_part('tabela', '.', 1)
        AND table_name = split_part('tabela', '.', 2)
        AND column_name = 'coluna'
    ) INTO col_exists;
    
    IF col_exists THEN
        seq_name := pg_get_serial_sequence('tabela', 'coluna');
        IF seq_name IS NOT NULL THEN
            EXECUTE format('SELECT COALESCE(MAX(%I), 1) FROM tabela', 'coluna') INTO max_val;
            EXECUTE format('SELECT setval(%L, %s)', seq_name, max_val);
        END IF;
    END IF;
END $$;
```

## Funcionalidades

### 🔧 Gerenciamento de Triggers
- Desabilita triggers antes da inserção para evitar problemas com foreign keys
- Reabilita triggers após a inserção

### 📊 Tratamento de Sequences
- Identifica automaticamente colunas ID (com padrões `id` ou `_id`)
- Ajusta sequences para o valor máximo + 1
- Tratamento seguro com verificação de NULL

### 🛡️ Tratamento de Dados
- Parse robusto de linhas COPY (tab separado)
- Formatação automática de tipos de dados
- Tratamento de valores NULL, booleanos, JSON, timestamps
- Escape seguro de caracteres especiais

## Uso

### Versão Básica
```bash
node extract_inserts.js <arquivo_dump> [arquivo_saida]
```

### Versão Avançada
```bash
node extract_inserts_advanced.js <arquivo_dump> [arquivo_saida]
```

### Exemplo
```bash
node extract_inserts_advanced.js dump_2025-07-01.sql restore_inserts.sql
```

## Estrutura do Script Gerado

1. **Desabilitação de Triggers** - Evita problemas com foreign keys
2. **Inserção de Dados** - INSERT INTO com ON CONFLICT DO NOTHING
3. **Reabilitação de Triggers** - Restaura funcionamento normal
4. **Ajuste de Sequences** - Corrige valores das chaves primárias

## Melhorias Implementadas

### 🧹 Código Limpo
- Remoção de comentários desnecessários
- Docstrings claras em português para todas as funções públicas
- Nomes descritivos para variáveis e métodos

### 🏗️ Arquitetura
- Separação de responsabilidades (SRP)
- Métodos dedicados para gerenciamento de triggers e sequences
- Tratamento robusto de erros

### 🔒 Segurança
- Validação de tipos de dados
- Escape seguro de strings SQL
- Tratamento de valores NULL

## Requisitos

- Node.js 14+
- PostgreSQL (para execução dos scripts gerados)

## Exemplo de Saída

```sql
-- Script de Inserção de Dados via INSERT INTO
-- Gerado automaticamente a partir do dump
-- Data: 2025-01-27T10:30:00.000Z
-- Versão: Advanced

-- Desabilitar triggers para evitar problemas com foreign keys
DO $$
DECLARE
r RECORD;
BEGIN
FOR r IN
SELECT conname, conrelid::regclass::text AS table_name
FROM pg_constraint
WHERE contype = 'f'
LOOP
EXECUTE format('ALTER TABLE %s DISABLE TRIGGER ALL', r.table_name);
END LOOP;
END $$;

-- Inserir dados
-- Dados para "public"."usuarios"
INSERT INTO "public"."usuarios" (id, nome, email) VALUES (1, 'João Silva', 'joao@email.com') ON CONFLICT DO NOTHING;
INSERT INTO "public"."usuarios" (id, nome, email) VALUES (2, 'Maria Santos', 'maria@email.com') ON CONFLICT DO NOTHING;

-- Reabilitar triggers
DO $$
DECLARE
r RECORD;
BEGIN
FOR r IN
SELECT conname, conrelid::regclass::text AS table_name
FROM pg_constraint
WHERE contype = 'f'
LOOP
EXECUTE format('ALTER TABLE %s ENABLE TRIGGER ALL', r.table_name);
END LOOP;
END $$;

-- Ajustar sequences das chaves primárias
-- Ajustar sequence para "public"."usuarios".id
DO $$
DECLARE
    seq_name text;
    max_val bigint;
BEGIN
    seq_name := pg_get_serial_sequence('"public"."usuarios"', 'id');
    IF seq_name IS NOT NULL THEN
        SELECT COALESCE(MAX(id), 1) INTO max_val FROM "public"."usuarios";
        EXECUTE format('SELECT setval(%L, %s)', seq_name, max_val);
    END IF;
END $$;
```

## Suporte

Para problemas ou dúvidas, verifique:
1. Se o arquivo de dump está no formato correto (COPY)
2. Se as permissões de banco estão adequadas
3. Se não há caracteres especiais problemáticos nos dados 