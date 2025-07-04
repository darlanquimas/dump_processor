#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class AdvancedDumpExtractor {
    constructor(dumpFile) {
        this.dumpFile = dumpFile;
        this.data = {
            tables: {},
            copies: [],
            sequences: []
        };
        this.errors = [];
    }

    async processDump() {
        console.log('Processando arquivo de dump...');
        
        try {
            const content = fs.readFileSync(this.dumpFile, 'utf8');
            const lines = content.split('\n');
            
            let currentCopy = null;
            let inCopyData = false;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].replace(/\r$/, ''); // Remover \r se existir
                
                // Verificar se é início de COPY
                const copyMatch = line.match(/^COPY ([^"]+"[^"]+") \(([^)]+)\) FROM stdin;?$/);
                if (copyMatch) {
                    console.log(`Encontrado COPY: ${copyMatch[1]}`);
                    currentCopy = {
                        table: copyMatch[1],
                        columns: copyMatch[2],
                        data: []
                    };
                    inCopyData = true;
                    continue;
                }
                
                // Verificar se é fim de COPY
                if (line === '\\\.' && inCopyData && currentCopy) {
                    console.log(`Finalizando COPY: ${currentCopy.table}`);
                    this.data.copies.push({
                        table: currentCopy.table,
                        columns: currentCopy.columns,
                        data: currentCopy.data.join('\n')
                    });
                    currentCopy = null;
                    inCopyData = false;
                    continue;
                }
                
                // Se estamos dentro dos dados COPY
                if (inCopyData && currentCopy) {
                    currentCopy.data.push(line);
                }
            }

            console.log(`Encontradas ${this.data.copies.length} tabelas com dados`);
            
            // Debug: mostrar algumas tabelas encontradas
            if (this.data.copies.length > 0) {
                console.log('Tabelas encontradas:');
                this.data.copies.slice(0, 5).forEach((copy, i) => {
                    console.log(`${i+1}. ${copy.table} - ${copy.data.split('\n').length} linhas`);
                });
            }
            
        } catch (error) {
            this.errors.push(`Erro ao processar dump: ${error.message}`);
            throw error;
        }
        
        return this.data;
    }

    generateInsertScript() {
        const script = [];
        
        script.push('-- Script de Inserção de Dados via INSERT INTO');
        script.push('-- Gerado automaticamente a partir do dump');
        script.push('-- Data: ' + new Date().toISOString());
        script.push('-- Versão: Advanced');
        script.push('');
        
        // Desabilitar triggers
        script.push('-- Desabilitar triggers para evitar problemas com foreign keys');
        script.push('DO $$');
        script.push('DECLARE');
        script.push('r RECORD;');
        script.push('BEGIN');
        script.push('FOR r IN');
        script.push('SELECT conname, conrelid::regclass::text AS table_name');
        script.push('FROM pg_constraint');
        script.push('WHERE contype = \'f\'');
        script.push('LOOP');
        script.push('EXECUTE format(\'ALTER TABLE %s DISABLE TRIGGER ALL\', r.table_name);');
        script.push('END LOOP;');
        script.push('END $$;');
        script.push('');
        
        script.push('-- Inserir dados');
        
        for (const copySection of this.data.copies) {
            const { table: tableName, columns, data } = copySection;
            const columnList = columns.split(',').map(col => col.trim());
            
            script.push(`-- Dados para ${tableName}`);
            
            const dataLines = data.split('\n');
            let lineCount = 0;
            
            for (const line of dataLines) {
                if (!line.trim()) continue;
                
                try {
                    const values = this.parseCopyLine(line);
                    const insertValues = values.map(v => this.formatValueAdvanced(v));
                    
                    const colStr = columnList.join(', ');
                    const valStr = insertValues.join(', ');
                    
                    script.push(`INSERT INTO ${tableName} (${colStr}) VALUES (${valStr}) ON CONFLICT DO NOTHING;`);
                    lineCount++;
                } catch (error) {
                    this.errors.push(`Erro na linha ${lineCount + 1} da tabela ${tableName}: ${error.message}`);
                    console.warn(`⚠️  Erro na linha da tabela ${tableName}: ${error.message}`);
                }
            }
            
            if (lineCount > 0) {
                script.push(`-- ${lineCount} registros inseridos em ${tableName}`);
            }
            script.push('');
        }
        
        // Reabilitar triggers
        script.push('-- Reabilitar triggers');
        script.push('DO $$');
        script.push('DECLARE');
        script.push('r RECORD;');
        script.push('BEGIN');
        script.push('FOR r IN');
        script.push('SELECT conname, conrelid::regclass::text AS table_name');
        script.push('FROM pg_constraint');
        script.push('WHERE contype = \'f\'');
        script.push('LOOP');
        script.push('EXECUTE format(\'ALTER TABLE %s ENABLE TRIGGER ALL\', r.table_name);');
        script.push('END LOOP;');
        script.push('END $$;');
        script.push('');
        
        // Ajustar sequences - versão mais robusta
        script.push('-- Ajustar sequences das chaves primárias');
        for (const copySection of this.data.copies) {
            const { table: tableName, columns } = copySection;
            const columnList = columns.split(',').map(col => col.trim());
            
            // Procurar por colunas que parecem ser IDs
            const idColumns = columnList.filter(col => 
                col.toLowerCase().includes('id') || 
                col.toLowerCase().includes('_id')
            );
            
            for (const idCol of idColumns) {
                script.push(`-- Ajustar sequence para ${tableName}.${idCol}`);
                script.push(`SELECT setval(pg_get_serial_sequence('${tableName}', '${idCol}'), COALESCE((SELECT MAX(${idCol}) FROM ${tableName}), 1));`);
                script.push('');
            }
        }
        
        // Adicionar resumo
        if (this.errors.length > 0) {
            script.push('-- AVISOS:');
            script.push('-- Os seguintes erros foram encontrados durante o processamento:');
            this.errors.forEach(error => {
                script.push(`-- ${error}`);
            });
            script.push('');
        }
        
        return script.join('\n');
    }

    parseCopyLine(line) {
        // Parse linha do COPY (tab separado) - versão mais robusta
        const values = [];
        let current = '';
        let inQuotes = false;
        let i = 0;
        
        while (i < line.length) {
            const char = line[i];
            
            if (char === '\t' && !inQuotes) {
                values.push(current);
                current = '';
            } else if (char === '\\' && i + 1 < line.length) {
                const nextChar = line[i + 1];
                if (nextChar === 'N') {
                    current += '\\N';
                    i++;
                } else if (nextChar === 't') {
                    current += '\t';
                    i++;
                } else if (nextChar === 'n') {
                    current += '\n';
                    i++;
                } else if (nextChar === '\\') {
                    current += '\\';
                    i++;
                } else {
                    current += char;
                }
            } else {
                current += char;
            }
            i++;
        }
        
        if (current) {
            values.push(current);
        }
        
        return values;
    }

    formatValueAdvanced(value) {
        if (value === '\\N' || value === '') {
            return 'NULL';
        }
        
        // Se for número (inteiro ou decimal)
        if (/^-?\d+(\.\d+)?$/.test(value)) {
            return value;
        }
        
        // Se for boolean
        if (value === 't' || value === 'f') {
            return `'${value}'`;
        }
        
        // Se parece ser JSON
        if ((value.startsWith('{') && value.endsWith('}')) || 
            (value.startsWith('[') && value.endsWith(']'))) {
            const escaped = value.replace(/'/g, "''");
            return `'${escaped}'`;
        }
        
        // Se parece ser timestamp
        if (/^\d{4}-\d{2}-\d{2}/.test(value) && value.includes(':')) {
            const escaped = value.replace(/'/g, "''");
            return `'${escaped}'`;
        }
        
        // String - escapar aspas simples e caracteres especiais
        const escaped = value
            .replace(/'/g, "''")
            .replace(/\0/g, ''); // Remover caracteres nulos
        
        return `'${escaped}'`;
    }

    async saveScript(outputFile) {
        const script = this.generateInsertScript();
        fs.writeFileSync(outputFile, script, 'utf8');
        console.log(`Script salvo em: ${outputFile}`);
        
        if (this.errors.length > 0) {
            console.log(`⚠️  ${this.errors.length} avisos encontrados durante o processamento`);
        }
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Uso: node extract_inserts_advanced.js <arquivo_dump> [arquivo_saida]');
        console.log('Exemplo: node extract_inserts_advanced.js dump_2025-07-01.sql restore_inserts.sql');
        process.exit(1);
    }
    
    const dumpFile = args[0];
    const outputFile = args[1] || 'restore_inserts_advanced.sql';
    
    if (!fs.existsSync(dumpFile)) {
        console.error(`Arquivo não encontrado: ${dumpFile}`);
        process.exit(1);
    }
    
    try {
        const extractor = new AdvancedDumpExtractor(dumpFile);
        await extractor.processDump();
        await extractor.saveScript(outputFile);
        
        console.log('\n✅ Script gerado com sucesso!');
        console.log('Para usar:');
        console.log(`1. Abra o arquivo ${outputFile} no DBeaver`);
        console.log('2. Execute o script completo');
        console.log('3. Os dados serão inseridos sem problemas de foreign keys');
        
        if (extractor.errors.length > 0) {
            console.log('\n⚠️  Avisos:');
            extractor.errors.forEach(error => console.log(`  - ${error}`));
        }
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = AdvancedDumpExtractor; 