# 📊 PostgreSQL Dump to INSERT Scripts

Ferramentas para extrair dados de dumps PostgreSQL e gerar scripts SQL com comandos INSERT para restauração em qualquer cliente SQL (DBeaver, DataGrip, etc.).

## 🎯 Objetivo

Converter dumps PostgreSQL (formato COPY) em scripts SQL com comandos INSERT que funcionam em qualquer cliente gráfico, evitando problemas com foreign keys e garantindo a integridade dos dados.

## 📁 Arquivos

### 🔧 Scripts Disponíveis

1. **`extract_inserts.js`** - Versão básica
2. **`extract_inserts_advanced.js`** - Versão avançada (recomendada)

## 🚀 Como Usar

### Pré-requisitos

- Node.js instalado
- Arquivo de dump PostgreSQL (.sql)

### Uso Básico

```bash
# Versão básica
node extract_inserts.js dump_2025-07-01.sql

# Versão avançada (recomendada)
node extract_inserts_advanced.js dump_2025-07-01.sql

# Especificar arquivo de saída
node extract_inserts_advanced.js dump_2025-07-01.sql meu_script_inserts.sql
```

### Exemplo de Uso

```bash
# Gerar script de INSERTs
node extract_inserts_advanced.js dump_2025-07-01.sql restore_data.sql

# Abrir no DBeaver e executar
```

## 📋 Funcionalidades

### ✅ Versão Básica (`extract_inserts.js`)

- **Detecção automática** de todas as tabelas no dump
- **Conversão COPY → INSERT** com `ON CONFLICT DO NOTHING`
- **Desabilitação de triggers** para evitar problemas com foreign keys
- **Ajuste de sequências** para colunas 'id'
- **Tratamento básico** de tipos de dados (NULL, números, strings, boolean)

### 🚀 Versão Avançada (`extract_inserts_advanced.js`)

**Tudo da versão básica +:**

- **Tratamento robusto** de tipos de dados complexos
- **Suporte a JSON e arrays** PostgreSQL
- **Timestamps complexos** e formatos de data
- **Múltiplas colunas de ID** (`id`, `user_id`, `product_id`, etc.)
- **Tratamento de erros** com logs detalhados
- **Contagem de registros** por tabela
- **Escape de caracteres especiais** em strings
- **Remoção de caracteres nulos** problemáticos
- **Logs de avisos** para problemas encontrados

## 🔍 Como Funciona

### 1. **Análise do Dump**
```javascript
// Detecta automaticamente todas as tabelas com dados
COPY cms."Componentes" (id, nome, descricao, ...) FROM stdin;
1    Componente teste    1    2025-06-09 16:02:21.497 ...
\.
```

### 2. **Conversão para INSERT**
```sql
-- Desabilita triggers para foreign keys
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

-- Insere dados
INSERT INTO cms."Componentes" (id, nome, descricao, ...) 
VALUES (1, 'Componente teste', 1, '2025-06-09 16:02:21.497', ...) 
ON CONFLICT DO NOTHING;

-- Reabilita triggers
DO $$ ... END $$;

-- Ajusta sequências
SELECT setval(pg_get_serial_sequence('cms."Componentes"', 'id'), 
       COALESCE((SELECT MAX(id) FROM cms."Componentes"), 1));
```

## 🎯 Vantagens

### ✅ **Compatibilidade Universal**
- Funciona em **qualquer cliente SQL** (DBeaver, DataGrip, pgAdmin, etc.)
- Não depende do comando `COPY FROM stdin` (que só funciona no psql)

### ✅ **Segurança de Dados**
- **Evita duplicidade** com `ON CONFLICT DO NOTHING`
- **Preserva integridade** com foreign keys
- **Ajusta sequências** automaticamente

### ✅ **Flexibilidade**
- **Detecta automaticamente** todas as tabelas
- **Funciona com qualquer schema** (public, cms, etc.)
- **Independente da estrutura** do banco

### ✅ **Robustez**
- **Tratamento de erros** robusto
- **Logs detalhados** de problemas
- **Suporte a tipos complexos** (JSON, arrays, timestamps)

## 📊 Tipos de Dados Suportados

### Versão Básica
- ✅ NULL (`\N`)
- ✅ Números (inteiros e decimais)
- ✅ Strings básicas
- ✅ Boolean (`t`/`f`)
- ✅ Timestamps simples

### Versão Avançada
- ✅ **Tudo da versão básica +**
- ✅ JSON e arrays PostgreSQL
- ✅ Timestamps complexos
- ✅ Caracteres especiais em strings
- ✅ Múltiplos formatos de data
- ✅ Escape de aspas e caracteres especiais

## 🔧 Exemplos de Uso

### Exemplo 1: Restauração Simples
```bash
# Gerar script
node extract_inserts_advanced.js backup.sql restore.sql

# No DBeaver: abrir restore.sql e executar
```

### Exemplo 2: Restauração com Nome Personalizado
```bash
# Gerar com nome específico
node extract_inserts_advanced.js dump.sql dados_producao.sql

# Resultado: dados_producao.sql
```

### Exemplo 3: Verificação de Erros
```bash
node extract_inserts_advanced.js dump.sql
# Saída:
# ✅ Script gerado com sucesso!
# ⚠️  2 avisos encontrados durante o processamento
#   - Erro na linha 15 da tabela usuarios: valor inválido
```

## 🚨 Solução de Problemas

### Erro: "unexpected message type 0x50 during COPY"
**Causa:** Tentativa de executar COPY no DBeaver
**Solução:** Use os scripts INSERT gerados por esta ferramenta

### Erro: "violates foreign key constraint"
**Causa:** Constraints ativas durante inserção
**Solução:** Os scripts desabilitam automaticamente as constraints

### Erro: "syntax error at or near"
**Causa:** Valores vazios ou caracteres especiais
**Solução:** Use a versão avançada que trata esses casos

## 📈 Performance

### Comparação de Métodos

| Método | Velocidade | Compatibilidade | Segurança |
|--------|------------|-----------------|-----------|
| **COPY direto** | ⚡⚡⚡⚡⚡ | ❌ Apenas psql | ⚠️ Média |
| **INSERT básico** | ⚡⚡⚡ | ✅ Universal | ✅ Alta |
| **INSERT avançado** | ⚡⚡⚡⚡ | ✅ Universal | ✅ Muito Alta |

## 🔄 Fluxo de Trabalho Recomendado

1. **Gerar dump** do banco PostgreSQL
2. **Executar script** de extração
3. **Abrir arquivo gerado** no DBeaver
4. **Executar script** completo
5. **Verificar logs** de avisos (se houver)

## 📝 Logs e Debug

### Informações Exibidas
```
Processando arquivo de dump...
Encontrado COPY: cms."Componentes"
Finalizando COPY: cms."Componentes"
Encontradas 38 tabelas com dados
Tabelas encontradas:
1. cms."Componentes" - 1 linhas
2. cms."EnvioMarketing" - 1 linhas
✅ Script gerado com sucesso!
```

### Avisos de Erro
```
⚠️  Erro na linha da tabela usuarios: valor inválido
⚠️  2 avisos encontrados durante o processamento
```

## 🤝 Contribuição

Para melhorar os scripts:

1. **Reporte bugs** com exemplos específicos
2. **Sugira novos tipos de dados** para suporte
3. **Teste com diferentes dumps** e reporte problemas

## 📄 Licença

Este projeto é de código aberto e pode ser usado livremente para fins comerciais e não comerciais.

---

**🎯 Recomendação:** Use sempre a versão **Advanced** para máxima compatibilidade e segurança! 