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
  ScrollView,
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
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'chart'
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
      return;
    }

    const trimmedCategory = category.trim();
    const trimmedNote = note.trim();
    const trimmedDate = date.trim();

    if (!trimmedCategory) {
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
    return (
      dt.getFullYear() === now.getFullYear() &&
      dt.getMonth() === now.getMonth()
    );
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

  const getDailyTotals = () => {
    const list = getDisplayedExpenses();
    const map = {};
    list.forEach((it) => {
      const date = it.date;
      if (!date) return;
      const cat = it.category || 'Other';
      if (!map[date]) {
        map[date] = {};
      }
      map[date][cat] = (map[date][cat] || 0) + Number(it.amount || 0);
    });

    const arr = Object.entries(map).map(([date, categoryMap]) => {
      const dt = new Date(date);
      const dayNames = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      const dayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayName = Number.isNaN(dt.getTime())
        ? date
        : dayNames[dt.getDay()];
      const dayShort = Number.isNaN(dt.getTime())
        ? date
        : dayNamesShort[dt.getDay()];
      const total = Object.values(categoryMap).reduce(
        (sum, amt) => sum + amt,
        0
      );
      return { date, total, dayName, dayShort, categories: categoryMap };
    });
    arr.sort((a, b) => a.date.localeCompare(b.date));
    return arr;
  };

  const BAR_MAX_HEIGHT = 320;

  const getCategoryColor = (category) => {
    const categoryColors = {
      Food: '#10b981',
      Books: '#3b82f6',
      Rent: '#f97316',
      Transport: '#8b5cf6',
      Entertainment: '#ec4899',
      Utilities: '#06b6d4',
      Other: '#6b7280',
    };
    return categoryColors[category] || categoryColors['Other'];
  };

  const normalizeToISO = (d) => {
    if (!d) return null;
    const s = String(d).replace(/[^0-9]/g, '');

    const valid = (y, m, day) => {
      const yi = parseInt(y, 10);
      const mi = parseInt(m, 10);
      const di = parseInt(day, 10);
      if (Number.isNaN(yi) || Number.isNaN(mi) || Number.isNaN(di)) return false;
      if (mi < 1 || mi > 12) return false;
      if (di < 1 || di > 31) return false;
      return true;
    };

    if (s.length === 8) {
      const maybeYear = s.slice(0, 4);
      const maybeMonth = s.slice(4, 6);
      const maybeDay = s.slice(6, 8);
      const yNum = parseInt(maybeYear, 10);
      if (
        yNum >= 1900 &&
        yNum <= 2100 &&
        valid(maybeYear, maybeMonth, maybeDay)
      ) {
        return `${maybeYear}-${maybeMonth}-${maybeDay}`;
      }
    }

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
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    const iso = normalizeToISO(d);
    return iso || d;
  };

  const formatShortDate = (iso) => {
    if (!iso) return 'No date';
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const m = iso.slice(5, 7);
      const dd = iso.slice(8, 10);
      return `${m}/${dd}`;
    }
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return String(iso);
    return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(
      dt.getDate()
    ).padStart(2, '0')}`;
  };

  const renderExpense = ({ item }) => (
    <View style={styles.expenseRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.expenseAmount}>
          ${Number(item.amount).toFixed(2)}
        </Text>
        <Text style={styles.expenseCategory}>{item.category}</Text>
        {item.note ? <Text style={styles.expenseNote}>{item.note}</Text> : null}
        {item.date ? (
          <Text style={styles.expenseDate}>{formatDate(item.date)}</Text>
        ) : null}
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

      try {
        const cols = await db.getAllAsync(`PRAGMA table_info(expenses);`);
        const hasDate = cols.some((c) => c.name === 'date');
        if (!hasDate) {
          await db.runAsync(`ALTER TABLE expenses ADD COLUMN date TEXT;`);
        }
      } catch (e) {
        // ignore
      }

      await loadExpenses();
    }

    setup();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Student Expense Tracker</Text>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'list' && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab('list')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'list' && styles.tabTextActive,
            ]}
          >
            Expenses
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'chart' && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab('chart')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'chart' && styles.tabTextActive,
            ]}
          >
            Chart
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'list' ? (
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
            <Button
              title={editingId ? 'Save Changes' : 'Add Expense'}
              onPress={addExpense}
            />
            {editingId ? (
              <Button title="Cancel" onPress={cancelEdit} color="#9ca3af" />
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.filters}>
        {(() => {
          const allCount = expenses.length;
          const weekCount = expenses.filter(
            (it) => it.date && isDateInCurrentWeek(it.date)
          ).length;
          const monthCount = expenses.filter(
            (it) => it.date && isDateInCurrentMonth(it.date)
          ).length;
          return (
            <>
              <TouchableOpacity
                style={[
                  styles.filterButton,
                  filter === 'all' && styles.filterButtonActive,
                ]}
                onPress={() => setFilter('all')}
              >
                <Text
                  style={[
                    styles.filterText,
                    filter === 'all' && styles.filterTextActive,
                  ]}
                >
                  All ({allCount})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.filterButton,
                  filter === 'week' && styles.filterButtonActive,
                ]}
                onPress={() => setFilter('week')}
              >
                <Text
                  style={[
                    styles.filterText,
                    filter === 'week' && styles.filterTextActive,
                  ]}
                >
                  This Week ({weekCount})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.filterButton,
                  filter === 'month' && styles.filterButtonActive,
                ]}
                onPress={() => setFilter('month')}
              >
                <Text
                  style={[
                    styles.filterText,
                    filter === 'month' && styles.filterTextActive,
                  ]}
                >
                  This Month ({monthCount})
                </Text>
              </TouchableOpacity>
            </>
          );
        })()}
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>
          Total (
          {filter === 'all'
            ? 'All'
            : filter === 'week'
            ? 'This Week'
            : 'This Month'}
          ):
        </Text>
        <Text style={styles.totalValue}>{getFilterSum()}</Text>
      </View>

      <View style={styles.categoryBreakdown}>
        <Text style={styles.categoryHeader}>
          By Category (
          {filter === 'all'
            ? 'All'
            : filter === 'week'
            ? 'This Week'
            : 'This Month'}
          ):
        </Text>
        {getTotalsByCategory().map((c) => (
          <View style={styles.categoryRow} key={c.category}>
            <Text style={styles.categoryName}>• {c.category}</Text>
            <Text style={styles.categoryAmount}>
              ${c.total.toFixed(2)}
            </Text>
          </View>
        ))}
      </View>

      {activeTab === 'chart' ? (
        <View style={styles.chartContainer}>
          <Text style={styles.chartHeader}>Spending by Day</Text>

          {/* Legend */}
          <View style={styles.legendRow}>
            {(() => {
              const daily = getDailyTotals();
              const allCategories = new Set();
              daily.forEach((d) => {
                Object.keys(d.categories || {}).forEach((cat) =>
                  allCategories.add(cat)
                );
              });
              const sortedCats = Array.from(allCategories).sort();
              return sortedCats.map((cat) => (
                <View
                  key={cat}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginRight: 12,
                  }}
                >
                  <View
                    style={[
                      styles.legendBox,
                      { backgroundColor: getCategoryColor(cat) },
                    ]}
                  />
                  <Text style={styles.legendText}>{cat}</Text>
                </View>
              ));
            })()}
          </View>

          {/* Chart + axes */}
          <View style={styles.chartRow}>
            {/* Y-axis label + ticks in same column */}
            {(() => {
              const daily = getDailyTotals();
              if (daily.length === 0) {
                return (
                  <View style={styles.yAxisWithLabel}>
                  </View>
                );
              }

              const max = Math.max(1, ...daily.map((d) => d.total));
              const maxRounded = Math.ceil(max / 10) * 10;
              const ticks = [0];
              for (let v = maxRounded / 5; v <= maxRounded; v += maxRounded / 5) {
                if (ticks.length < 5) ticks.push(Math.round(v));
              }

              return (
                <View style={styles.yAxisWithLabel}>
                  <View
                    style={[
                      styles.yAxis,
                      { height: BAR_MAX_HEIGHT, position: 'relative' },
                    ]}
                  >
                    <Text style={styles.yAxisLabel}>Price</Text>
                    {ticks.map((t) => {
                      const top = Math.round(
                        (1 - t / maxRounded) * BAR_MAX_HEIGHT
                      );
                      return (
                        <Text
                          key={String(t)}
                          style={[
                            styles.yTickAbsolute,
                            { top: Math.max(0, top - 8) },
                          ]}
                        >{`$${t}`}</Text>
                      );
                    })}
                  </View>
                </View>
              );
            })()}

            {/* Bars */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View
                style={[
                  styles.chartInner,
                  {
                    position: 'relative',
                    height: BAR_MAX_HEIGHT + 80,
                    paddingTop: 20,
                    paddingBottom: 20,
                  },
                ]}
              >
                {(() => {
                  const daily = getDailyTotals();
                  if (daily.length === 0) return null;
                  const max = Math.max(1, ...daily.map((d) => d.total));
                  return daily.map((d) => {
                    const label =
                      d.dayShort ||
                      (d.dayName
                        ? d.dayName.slice(0, 3)
                        : d.date
                        ? d.date.slice(5)
                        : d.date);
                    const dateStr = formatShortDate(d.date);
                    const categoryEntries = Object.entries(d.categories || {});
                    return (
                      <View style={styles.barColumn} key={d.date}>
                        <Text style={styles.barValue}>
                          ${d.total.toFixed(0)}
                        </Text>
                        <View style={styles.barArea}>
                          {categoryEntries.map(([cat, amt]) => {
                            const h = Math.round((amt / max) * BAR_MAX_HEIGHT);
                            const color = getCategoryColor(cat);
                            return (
                              <View
                                key={cat}
                                style={[
                                  styles.bar,
                                  {
                                    height: h,
                                    backgroundColor: color,
                                    marginBottom: 0,
                                  },
                                ]}
                              />
                            );
                          })}
                        </View>
                        <Text style={styles.barLabel}>{label}</Text>
                        <Text style={styles.barDate}>{dateStr}</Text>
                      </View>
                    );
                  });
                })()}

                {/* x-axis line */}
                <View
                  style={[styles.xAxisLine, { top: BAR_MAX_HEIGHT + 40 }]}
                />
              </View>
            </ScrollView>
          </View>

          {/* X-axis label */}
          <Text style={styles.xAxisLabel}>Day and date</Text>
        </View>
      ) : null}

      <FlatList
        data={activeTab === 'list' ? getDisplayedExpenses() : []}
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
  tabBar: {
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: 'transparent',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  tabButtonActive: {
    backgroundColor: '#374151',
  },
  tabText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  tabTextActive: {
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
  chartContainer: {
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  chartHeader: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendBox: {
    width: 12,
    height: 12,
    backgroundColor: '#60a5fa',
    marginRight: 8,
    borderRadius: 2,
  },
  legendText: {
    color: '#9ca3af',
    fontSize: 12,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  // Y axis = label + ticks stacked vertically
  yAxisWithLabel: {
    width: 70,
    alignItems: 'center',
    marginRight: 4,
    paddingLeft: 8,
  },
  yAxisLabel: {
    color: '#9ca3af',
    fontSize: 12,
    textAlign: 'center',
    transform: [{ rotate: '-90deg' }],
    width: 320,
    height: 20,
    position: 'absolute',
    top: '50%',
    left: -150,
  },
  yAxis: {
    width: '100%',
    alignItems: 'flex-end',
    paddingRight: 8,
    justifyContent: 'space-between',
  },
  yTick: {
    color: '#9ca3af',
    fontSize: 11,
    textAlign: 'right',
  },
  yTickAbsolute: {
    position: 'absolute',
    fontSize: 12,
    right: 0,
    color: '#9ca3af',
    fontSize: 11,
    textAlign: 'right',
  },
  chartInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    minHeight: 360,
  },
  barColumn: {
    width: 96,
    alignItems: 'center',
    marginRight: 16,
  },
  barValue: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 10,
  },
  barArea: {
    height: 320,
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexDirection: 'column',
    paddingBottom: 4,
  },
  bar: {
    width: 48,
    backgroundColor: '#60a5fa',
    borderRadius: 8,
    marginBottom: 6,
  },
  barLabel: {
    color: '#9ca3af',
    fontSize: 11,
    marginTop: 2,
  },
  barDate: {
    color: '#9ca3af',
    fontSize: 11,
    marginTop: 4,
  },
  xAxisLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#374151',
    zIndex: 0,
  },
  // X axis label
  xAxisLabel: {
    color: '#9ca3af',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
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
