export function buildUpdateSet(data: object, allowedColumns: string[]) {
  const assignments: string[] = [];
  const values: unknown[] = [];
  const valuesByColumn = data as Record<string, unknown>;

  for (const column of allowedColumns) {
    if (valuesByColumn[column] !== undefined) {
      assignments.push(`\`${column}\` = ?`);
      values.push(valuesByColumn[column]);
    }
  }

  assignments.push('`updatedAt` = NOW(3)');

  return {
    sql: assignments.join(', '),
    values,
  };
}

export function toDateOrNull(value?: string) {
  return value ? new Date(value) : null;
}
