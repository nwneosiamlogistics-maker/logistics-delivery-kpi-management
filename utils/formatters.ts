// Format number with comma separator and 2 decimal places (e.g., 207,205.67)
export const formatQty = (num: number | undefined | null): string => {
  if (num === undefined || num === null) return '-';
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Format number with comma separator, no decimal (e.g., 1,234)
export const formatNum = (num: number | undefined | null): string => {
  if (num === undefined || num === null) return '-';
  return num.toLocaleString('en-US');
};
