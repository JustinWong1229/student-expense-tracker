import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

export default function ExpenseScreen() {
  const db = useSQLiteContext();

  const [expenses, setExpenses] = useState([]);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'week' | 'month'
  const [datePreview, setDatePreview] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const loadExpenses = async () => {
    const rows = await db.getAllAsync(
      'SELECT * FROM expenses ORDER BY id DESC;'
    );
    setExpenses(rows);
  };
  const addExpense = async () => {
    const amountNumber = parseFloat(amount);

    if (isNaN(amountNumber) || amountNumber <= 0) {
      // Basic validation: ignore invalid or non-positive amounts
      return;
    }

    const trimmedCategory = category.trim();
    const trimmedNote = note.trim();
    const trimmedDate = date.trim();

    if (!trimmedCategory) {
      // Category is required
      return;
    }

    const isoDate = normalizeToISO(trimmedDate) || null;

    if (editingId) {
      await db.runAsync(
        'UPDATE expenses SET amount = ?, category = ?, note = ?, date = ? WHERE id = ?;',
        [amountNumber, trimmedCategory, trimmedNote || null, isoDate, editingId]
      );
      setEditingId(null);
    } else {
      await db.runAsync(
        'INSERT INTO expenses (amount, category, note, date) VALUES (?, ?, ?, ?);',
        [amountNumber, trimmedCategory, trimmedNote || null, isoDate]
      );
    }

    setAmount('');
    setCategory('');
    setNote('');
    setDate('');
    setDatePreview(null);

    await loadExpenses();
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setAmount(String(item.amount));
    setCategory(item.category || '');
    setNote(item.note || '');
    // store digits only in input, preview shows normalized
    setDate(item.date ? String(item.date).replace(/[^0-9]/g, '') : '');
    setDatePreview(item.date || null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setAmount('');
    setCategory('');
    setNote('');
    setDate('');
    setDatePreview(null);
  };
  const deleteExpense = async (id) => {
    await db.runAsync('DELETE FROM expenses WHERE id = ?;', [id]);
    loadExpenses();
  };
  const isDateInCurrentWeek = (dateStr) => {
    if (!dateStr) return false;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const now = new Date();
    const start = new Date(now);
    // Week starts on Sunday (0)
    start.setHours(0, 0, 0, 0);
    start.setDate(now.getDate() - now.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return dt >= start && dt <= end;
  };

  const isDateInCurrentMonth = (dateStr) => {
    if (!dateStr) return false;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const now = new Date();
    return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
  };

  const getDisplayedExpenses = () => {
    if (filter === 'all') return expenses;
    return expenses.filter((it) => {
      const dateVal = it.date;
      if (!dateVal) return false;
      if (filter === 'week') return isDateInCurrentWeek(dateVal);
      if (filter === 'month') return isDateInCurrentMonth(dateVal);
      return true;
    });
  };
  const getFilterSum = () => {
    const list = getDisplayedExpenses();
    const sum = list.reduce((acc, it) => acc + Number(it.amount || 0), 0);
    return `$${sum.toFixed(2)}`;
  };

  const getTotalsByCategory = () => {
    const list = getDisplayedExpenses();
    const map = {};
    list.forEach((it) => {
      const raw = it.category;
      const cat = raw ? String(raw).trim() : 'Other';
      const key = cat || 'Other';
      const amt = Number(it.amount || 0);
      map[key] = (map[key] || 0) + (Number.isFinite(amt) ? amt : 0);
    });
    return Object.entries(map)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  };
  const normalizeToISO = (d) => {
    if (!d) return null;
    const s = String(d).replace(/[^0-9]/g, '');

    // Helper to validate numeric ranges
    const valid = (y, m, day) => {
      const yi = parseInt(y, 10);
      const mi = parseInt(m, 10);
      const di = parseInt(day, 10);
      if (Number.isNaN(yi) || Number.isNaN(mi) || Number.isNaN(di)) return false;
      if (mi < 1 || mi > 12) return false;
      if (di < 1 || di > 31) return false;
      return true;
    };

    // If 8 digits and looks like YYYYMMDD, use that
    if (s.length === 8) {
      const maybeYear = s.slice(0, 4);
      const maybeMonth = s.slice(4, 6);
      const maybeDay = s.slice(6, 8);
      const yNum = parseInt(maybeYear, 10);
      if (yNum >= 1900 && yNum <= 2100 && valid(maybeYear, maybeMonth, maybeDay)) {
        return `${maybeYear}-${maybeMonth}-${maybeDay}`;
      }
      // else fall through and treat as MMDDYYYY
    }

    // If we have at least 5 digits, assume last 4 are the year
    if (s.length >= 5) {
      const year = s.slice(-4);
      const rest = s.slice(0, -4);
      const day = rest.slice(-2);
      const month = rest.slice(0, rest.length - 2) || rest.slice(0, 1);

      const mm = month.padStart(2, '0');
      const dd = day.padStart(2, '0');

      if (valid(year, mm, dd)) return `${year}-${mm}-${dd}`;
    }

    return null;
  };

  const formatDate = (d) => {
    if (!d) return null;
    // If already ISO, return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const iso = normalizeToISO(d);
    return iso || d;
  };

  const renderExpense = ({ item }) => (
    <View style={styles.expenseRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.expenseAmount}>${Number(item.amount).toFixed(2)}</Text>
        <Text style={styles.expenseCategory}>{item.category}</Text>
        {item.note ? <Text style={styles.expenseNote}>{item.note}</Text> : null}
        {item.date ? <Text style={styles.expenseDate}>{formatDate(item.date)}</Text> : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => startEdit(item)}>
          <Text style={styles.edit}>✎</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => deleteExpense(item.id)}>
          <Text style={styles.delete}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
   useEffect(() => {
    async function setup() {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          amount REAL NOT NULL,
          category TEXT NOT NULL,
          note TEXT
        );
      `);

      // Ensure a `date` column exists on older databases
      try {
        const cols = await db.getAllAsync(`PRAGMA table_info(expenses);`);
        const hasDate = cols.some((c) => c.name === 'date');
        if (!hasDate) {
          await db.runAsync(`ALTER TABLE expenses ADD COLUMN date TEXT;`);
        }
      } catch (e) {
        // If PRAGMA or ALTER fails, ignore and continue — table may not exist yet
      }

      await loadExpenses();
    }

    setup();
  }, []);
   return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Student Expense Tracker</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Amount (e.g. 12.50)"
          placeholderTextColor="#9ca3af"
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />
        <TextInput
          style={styles.input}
          placeholder="Category (Food, Books, Rent...)"
          placeholderTextColor="#9ca3af"
          value={category}
          onChangeText={setCategory}
        />
        <TextInput
          style={styles.input}
          placeholder="Note (optional)"
          placeholderTextColor="#9ca3af"
          value={note}
          onChangeText={setNote}
        />
        <TextInput
          style={styles.input}
          placeholder="Date (optional)"
          placeholderTextColor="#9ca3af"
          keyboardType="numeric"
          maxLength={8}
          value={date}
          onChangeText={(t) => {
            const clean = t.replace(/[^0-9]/g, '');
            setDate(clean);
            const iso = normalizeToISO(clean);
            setDatePreview(iso || (clean ? 'Invalid date' : null));
          }}
        />
        {datePreview ? (
          <Text style={styles.datePreview}>Preview: {datePreview}</Text>
        ) : null}
        <View style={styles.formButtons}>
          <Button title={editingId ? 'Save Changes' : 'Add Expense'} onPress={addExpense} />
          {editingId ? (
            <Button title="Cancel" onPress={cancelEdit} color="#9ca3af" />
          ) : null}
        </View>
      </View>

      <View style={styles.filters}>
        {(() => {
          const allCount = expenses.length;
          const weekCount = expenses.filter((it) => it.date && isDateInCurrentWeek(it.date)).length;
          const monthCount = expenses.filter((it) => it.date && isDateInCurrentMonth(it.date)).length;
          return (
            <>
              <TouchableOpacity
                style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
                onPress={() => setFilter('all')}
              >
                <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>All ({allCount})</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterButton, filter === 'week' && styles.filterButtonActive]}
                onPress={() => setFilter('week')}
              >
                <Text style={[styles.filterText, filter === 'week' && styles.filterTextActive]}>This Week ({weekCount})</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterButton, filter === 'month' && styles.filterButtonActive]}
                onPress={() => setFilter('month')}
              >
                <Text style={[styles.filterText, filter === 'month' && styles.filterTextActive]}>This Month ({monthCount})</Text>
              </TouchableOpacity>
            </>
          );
        })()}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total ({filter === 'all' ? 'All' : filter === 'week' ? 'This Week' : 'This Month'}):</Text>
        <Text style={styles.totalValue}>{getFilterSum()}</Text>
      </View>

      <View style={styles.categoryBreakdown}>
        <Text style={styles.categoryHeader}>By Category ({filter === 'all' ? 'All' : filter === 'week' ? 'This Week' : 'This Month'}):</Text>
        {getTotalsByCategory().map((c) => (
          <View style={styles.categoryRow} key={c.category}>
            <Text style={styles.categoryName}>• {c.category}</Text>
            <Text style={styles.categoryAmount}>${c.total.toFixed(2)}</Text>
          </View>
        ))}
      </View>

      <FlatList
        data={getDisplayedExpenses()}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderExpense}
        ListEmptyComponent={
          <Text style={styles.empty}>No expenses yet.</Text>
        }
      />

      <Text style={styles.footer}>
        Enter your expenses and they’ll be saved locally with SQLite.
      </Text>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#111827' },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  form: {
    marginBottom: 16,
    gap: 8,
  },
  input: {
    padding: 10,
    backgroundColor: '#1f2937',
    color: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  expenseAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fbbf24',
  },
  expenseCategory: {
    fontSize: 14,
    color: '#e5e7eb',
  },
  expenseNote: {
    fontSize: 14,
    color: '#e5e7eb',
  },
  expenseDate: {
    fontSize: 12,
    color: '#ffffff',
  },
  filters: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  filterButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  filterButtonActive: {
    backgroundColor: '#374151',
  },
  filterText: {
    color: '#9ca3af',
    fontSize: 13,
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  datePreview: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: 'transparent',
    marginBottom: 8,
  },
  totalLabel: {
    color: '#9ca3af',
    fontSize: 14,
  },
  totalValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  categoryBreakdown: {
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  categoryHeader: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  categoryName: {
    color: '#e5e7eb',
    fontSize: 13,
  },
  categoryAmount: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  delete: {
    color: '#f87171',
    fontSize: 20,
    marginLeft: 12,
  },
  edit: {
    color: '#60a5fa',
    fontSize: 18,
    marginRight: 12,
  },
  formButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  empty: {
    color: '#9ca3af',
    marginTop: 24,
    textAlign: 'center',
  },
  footer: {
    textAlign: 'center',
    color: '#6b7280',
    marginTop: 12,
    fontSize: 12,
  },
});
    