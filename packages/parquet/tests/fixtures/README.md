# Parquet test file

`readings.parquet` holds 1,000 generated rows (`id`, `label`, `value`, `when`) in ten
zstd-compressed row groups of 100, with statistics and a page index. The package's unit
tests and the playground's browser tests serve it with byte ranges. It was written with
pyarrow 20:

```python
pq.write_table(table, 'readings.parquet', row_group_size=100, compression='zstd',
               write_page_index=True, data_page_size=256, write_statistics=True)
```
