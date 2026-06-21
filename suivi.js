// Suivi JS — LazerX Nabeul
(function() {
    'use strict';

    const CENTER_ID = 'nabeul';
    const CURRENCY = 'DT';
    const TIMEZONE = 'Africa/Tunis';
    const LOCALE = 'fr-TN';

    const PRICES = { tabac: 500, drogue: 750, drogue_dure: 1000, drogue_douce: 600, renforcement: 0 };
    const CAT_NAMES = { tabac: 'Tabac', drogue: 'Drogue', drogue_dure: 'Drogue dure', drogue_douce: 'Drogue douce', renforcement: 'Renforcement' };

    let sessions = [];
    let batchMode = false;
    let batchSelected = new Set();
    let currentSessionId = null;
    let weeklyChart = null;

    // ─── Auth ───
    const AUTH_KEY = 'lazerx_nabeul_suivi_auth';
    const AUTH_PIN = '062026';

    function checkAuth() {
        if (localStorage.getItem(AUTH_KEY) === 'true') {
            document.getElementById('authOverlay').style.display = 'none';
            init();
            return;
        }
        document.getElementById('authOverlay').style.display = 'flex';
        const input = document.getElementById('pinInput');
        input.focus();
        input.addEventListener('input', function() {
            if (this.value.length === 6) {
                if (this.value === AUTH_PIN) {
                    localStorage.setItem(AUTH_KEY, 'true');
                    document.getElementById('authOverlay').style.display = 'none';
                    init();
                } else {
                    document.getElementById('pinError').style.display = 'block';
                    this.value = '';
                    setTimeout(() => document.getElementById('pinError').style.display = 'none', 2000);
                    this.focus();
                }
            }
        });
    }

    window.lockSession = function() {
        localStorage.removeItem(AUTH_KEY);
        location.reload();
    };

    // ─── Init ───
    function init() {
        loadSessions();
        loadFinancialSummary();
        setInterval(() => { loadSessions(); loadFinancialSummary(); }, 60000);
    }

    // ─── Helpers ───
    function nowInTZ() {
        return new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
    }

    function todayStr() {
        const now = nowInTZ();
        return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    }

    function formatDate(dateStr) {
        if (!dateStr) return '-';
        return new Date(dateStr + 'T00:00:00').toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    function formatTime(timeStr) {
        if (!timeStr) return '-';
        return timeStr.substring(0, 5);
    }

    function getWeekRange() {
        const now = nowInTZ();
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(now);
        monday.setDate(diff);
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        return { start: monday, end: sunday };
    }

    function toISODate(d) {
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    // ─── API ───
    async function apiFetch(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Erreur réseau');
        return res.json();
    }

    async function apiPost(url, body) {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error('Erreur réseau');
        return res.json();
    }

    // ─── Load Sessions ───
    async function loadSessions() {
        try {
            const { bookings } = await apiFetch('/.netlify/functions/list-bookings?center=' + CENTER_ID + '&filter=pending');
            sessions = bookings || [];
            renderSessions();
        } catch (e) {
            console.error('Erreur chargement sessions:', e);
            document.getElementById('sessionsList').innerHTML = '<div class="empty-state">Erreur de chargement</div>';
        }
    }

    function renderSessions() {
        const container = document.getElementById('sessionsList');
        if (!sessions.length) {
            container.innerHTML = '<div class="empty-state">Aucune séance en attente ✓</div>';
            return;
        }

        container.innerHTML = sessions.map(s => {
            const basePrice = s.price || PRICES[s.category] || 0;
            const discount = s.discount || 0;
            const finalPrice = Math.max(0, basePrice - discount);
            const catName = CAT_NAMES[s.category] || s.category || '-';
            const paymentLabel = s.payment_method === 'especes' ? '💵 Espèces' : s.payment_method === 'cheque' ? '🧾 Chèque' : '';
            return '<div class="session-card" id="session-' + s.id + '">' +
                '<div class="session-header">' +
                    '<div>' +
                        (batchMode ? '<label class="checkbox-label"><input type="checkbox" onchange="toggleBatchItem(\'' + s.id + '\')" ' + (batchSelected.has(s.id) ? 'checked' : '') + '> ' : '') +
                        '<span class="session-name">' + (s.client_name || 'Client') + '</span>' +
                        (batchMode ? '</label>' : '') +
                    '</div>' +
                    '<div style="display:flex;gap:6px;align-items:center;">' +
                        (discount > 0 ? '<span class="badge-discount">-' + discount.toLocaleString(LOCALE) + ' ' + CURRENCY + '</span>' : '') +
                        (paymentLabel ? '<span class="badge-payment">' + paymentLabel + '</span>' : '') +
                        '<span class="price-tag">' + finalPrice.toLocaleString(LOCALE) + ' ' + CURRENCY + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="session-meta">' +
                    '📅 ' + formatDate(s.date) + ' à ' + formatTime(s.time) +
                    ' &bull; 📞 ' + (s.phone || '-') +
                    ' &bull; ' + catName +
                '</div>' +
                '<div class="session-actions">' +
                    '<button class="btn btn-present" onclick="quickConfirm(\'' + s.id + '\', \'present\')">✓ Présent</button>' +
                    '<button class="btn btn-absent" onclick="quickConfirm(\'' + s.id + '\', \'absent\')">✗ Absent</button>' +
                    '<button class="btn btn-reschedule" onclick="quickConfirm(\'' + s.id + '\', \'rescheduled\')">↻ Reporté</button>' +
                    '<button class="btn" style="background:#f0f0f0;color:#333;" onclick="openModal(\'' + s.id + '\')">✎ Détails</button>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    // ─── Quick Confirm ───
    window.quickConfirm = async function(id, attendance) {
        try {
            const session = sessions.find(s => s.id === id);
            const price = session ? (session.price || PRICES[session.category] || 0) : 0;
            const updates = {
                id,
                attendance,
                status: attendance === 'present' ? 'confirmed' : attendance === 'absent' ? 'no_show' : 'rescheduled'
            };
            if (attendance === 'present' && session && !session.price) updates.price = price;

            await apiPost('/.netlify/functions/update-attendance', updates);

            const card = document.getElementById('session-' + id);
            if (card) {
                card.style.opacity = '0';
                card.style.transform = 'translateX(20px)';
                card.style.transition = 'all 0.3s';
                setTimeout(() => {
                    sessions = sessions.filter(s => s.id !== id);
                    renderSessions();
                    loadFinancialSummary();
                }, 300);
            }
        } catch (e) {
            console.error('Erreur confirmation:', e);
            alert('Erreur lors de la confirmation');
        }
    };

    // ─── Modal helpers ───
    window.setAttendanceBtn = function(val) {
        document.getElementById('modalAttendance').value = val;
        document.getElementById('attPresent').className = 'att-btn' + (val === 'present' ? ' active-present' : '');
        document.getElementById('attAbsent').className = 'att-btn' + (val === 'absent' ? ' active-absent' : '');
        document.getElementById('attRescheduled').className = 'att-btn' + (val === 'rescheduled' ? ' active-reschedule' : '');
    };

    window.setPaymentBtn = function(val) {
        const current = document.getElementById('modalPaymentMethod').value;
        const newVal = current === val ? '' : val;
        document.getElementById('modalPaymentMethod').value = newVal;
        document.getElementById('payEspeces').className = 'pay-btn' + (newVal === 'especes' ? ' active-especes' : '');
        document.getElementById('payCheque').className = 'pay-btn' + (newVal === 'cheque' ? ' active-cheque' : '');
    };

    // ─── Modal ───
    window.openModal = function(id) {
        const session = sessions.find(s => s.id === id);
        if (!session) return;
        currentSessionId = id;

        // Header
        const initials = (session.client_name || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
        document.getElementById('modalAvatar').textContent = initials;
        document.getElementById('modalName').textContent = session.client_name || '—';
        document.getElementById('modalPhone').textContent = '📞 ' + (session.phone || '-');
        document.getElementById('modalCategory').textContent = CAT_NAMES[session.category] || session.category || '-';
        document.getElementById('modalDateTime').textContent = '📅 ' + formatDate(session.date) + ' à ' + formatTime(session.time);

        // Price & discount
        const stdPrice = PRICES[session.category] || 0;
        document.getElementById('modalPrice').value = session.price != null ? session.price : stdPrice;
        document.getElementById('modalStandardPrice').textContent = 'Tarif standard: ' + stdPrice.toLocaleString(LOCALE) + ' ' + CURRENCY;
        const discountVal = session.discount || 0;
        document.getElementById('modalDiscount').value = discountVal || '';
        const finalPrice = Math.max(0, (session.price != null ? session.price : stdPrice) - discountVal);
        document.getElementById('modalFinalPrice').textContent = discountVal > 0 ? '→ Net: ' + finalPrice.toLocaleString(LOCALE) + ' ' + CURRENCY : '';

        // Buttons state
        setAttendanceBtn(session.attendance || '');
        document.getElementById('modalPaymentMethod').value = session.payment_method || '';
        document.getElementById('payEspeces').className = 'pay-btn' + (session.payment_method === 'especes' ? ' active-especes' : '');
        document.getElementById('payCheque').className = 'pay-btn' + (session.payment_method === 'cheque' ? ' active-cheque' : '');

        document.getElementById('modalNotes').value = session.notes || '';

        document.getElementById('sessionModal').classList.add('active');

        function updateFinalPrice() {
            const p = parseFloat(document.getElementById('modalPrice').value) || 0;
            const d = parseFloat(document.getElementById('modalDiscount').value) || 0;
            const hint = document.getElementById('modalFinalPrice');
            hint.textContent = d > 0 ? '→ Net: ' + Math.max(0, p - d).toLocaleString(LOCALE) + ' ' + CURRENCY : '';
        }
        document.getElementById('modalPrice').oninput = updateFinalPrice;
        document.getElementById('modalDiscount').oninput = updateFinalPrice;
    };

    window.closeModal = function() {
        document.getElementById('sessionModal').classList.remove('active');
        currentSessionId = null;
    };

    window.saveSession = async function() {
        if (!currentSessionId) return;
        try {
            const attendance = document.getElementById('modalAttendance').value;
            const price = parseFloat(document.getElementById('modalPrice').value) || 0;
            const discount = parseFloat(document.getElementById('modalDiscount').value) || 0;
            const payment_method = document.getElementById('modalPaymentMethod').value;
            const notes = document.getElementById('modalNotes').value;

            const updates = { id: currentSessionId, price, discount, payment_method, notes };
            if (attendance) {
                updates.attendance = attendance;
                updates.status = attendance === 'present' ? 'confirmed' : attendance === 'absent' ? 'no_show' : 'rescheduled';
            }

            await apiPost('/.netlify/functions/update-attendance', updates);
            closeModal();
            loadSessions();
            loadFinancialSummary();
        } catch (e) {
            console.error('Erreur enregistrement:', e);
            alert('Erreur lors de l\'enregistrement');
        }
    };

    // ─── Batch ───
    window.toggleBatchMode = function() {
        batchMode = !batchMode;
        batchSelected.clear();
        updateBatchBar();
        renderSessions();
    };

    window.toggleBatchItem = function(id) {
        if (batchSelected.has(id)) batchSelected.delete(id);
        else batchSelected.add(id);
        updateBatchBar();
    };

    function updateBatchBar() {
        document.getElementById('batchCount').textContent = batchSelected.size;
        document.getElementById('batchBar').classList.toggle('visible', batchMode && batchSelected.size > 0);
    }

    window.batchConfirm = async function(attendance) {
        if (!batchSelected.size) return;
        const ids = Array.from(batchSelected);
        try {
            for (const id of ids) {
                const session = sessions.find(s => s.id === id);
                const price = session ? (session.price || PRICES[session.category] || 0) : 0;
                const updates = { id, attendance, status: attendance === 'present' ? 'confirmed' : 'no_show' };
                if (attendance === 'present' && session && !session.price) updates.price = price;
                await apiPost('/.netlify/functions/update-attendance', updates);
            }
            batchSelected.clear();
            batchMode = false;
            updateBatchBar();
            loadSessions();
            loadFinancialSummary();
        } catch (e) {
            console.error('Erreur batch:', e);
            alert('Erreur lors de la confirmation en lot');
        }
    };

    window.clearBatch = function() {
        batchSelected.clear();
        batchMode = false;
        updateBatchBar();
        renderSessions();
    };

    // ─── Financial Summary ───
    async function loadFinancialSummary() {
        try {
            const { bookings } = await apiFetch('/.netlify/functions/list-bookings?center=' + CENTER_ID);

            const today = todayStr();
            const week = getWeekRange();
            const weekStart = toISODate(week.start);
            const weekEnd = toISODate(week.end);

            let todayRevenue = 0, weekRevenue = 0, weekConfirmed = 0, weekTotal = 0;
            const dailyRevenue = {};
            const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

            for (let i = 0; i < 7; i++) {
                const d = new Date(week.start);
                d.setDate(d.getDate() + i);
                dailyRevenue[toISODate(d)] = 0;
            }

            bookings.forEach(b => {
                const basePrice = b.price || PRICES[b.category] || 0;
                const price = Math.max(0, basePrice - (b.discount || 0));
                const isConfirmed = b.attendance === 'present' || b.status === 'confirmed';

                if (b.date === today && isConfirmed) todayRevenue += price;

                if (b.date >= weekStart && b.date <= weekEnd) {
                    weekTotal++;
                    if (isConfirmed) {
                        weekRevenue += price;
                        weekConfirmed++;
                        if (dailyRevenue.hasOwnProperty(b.date)) dailyRevenue[b.date] += price;
                    }
                }
            });

            document.getElementById('finToday').innerHTML = todayRevenue.toLocaleString(LOCALE) + ' <span class="fin-unit">' + CURRENCY + '</span>';
            document.getElementById('finWeek').innerHTML = weekRevenue.toLocaleString(LOCALE) + ' <span class="fin-unit">' + CURRENCY + '</span>';
            document.getElementById('finConfirmedCount').textContent = weekConfirmed;
            const attendanceRate = weekTotal > 0 ? Math.round((weekConfirmed / weekTotal) * 100) : 0;
            document.getElementById('finAttendanceRate').innerHTML = attendanceRate + ' <span class="fin-unit">%</span>';

            updateWeeklyChart(dayNames, Object.values(dailyRevenue));
        } catch (e) {
            console.error('Erreur résumé financier:', e);
        }
    }

    function updateWeeklyChart(labels, data) {
        const ctx = document.getElementById('weeklyChart').getContext('2d');
        if (weeklyChart) weeklyChart.destroy();
        weeklyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Revenu (' + CURRENCY + ')', data, backgroundColor: '#2563eb', borderRadius: 8, barPercentage: 0.6 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => ctx.parsed.y.toLocaleString(LOCALE) + ' ' + CURRENCY } }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString(LOCALE), font: { family: 'Inter', size: 11 } }, grid: { color: '#f0f0f0' } },
                    x: { ticks: { font: { family: 'Inter', size: 12 } }, grid: { display: false } }
                }
            }
        });
    }

    // ─── Export Finances ───
    window.exportFinances = async function() {
        try {
            const { bookings } = await apiFetch('/.netlify/functions/list-bookings?center=' + CENTER_ID + '&status=confirmed');
            const headers = ['Date', 'Nom', 'Téléphone', 'Email', 'Catégorie', 'Présence', 'Prix (' + CURRENCY + ')', 'Réduction (' + CURRENCY + ')', 'Net (' + CURRENCY + ')', 'Paiement'];
            const rows = bookings.map(b => {
                const basePrice = b.price || PRICES[b.category] || 0;
                const discount = b.discount || 0;
                const net = Math.max(0, basePrice - discount);
                const payLabel = b.payment_method === 'especes' ? 'Espèces' : b.payment_method === 'cheque' ? 'Chèque' : '';
                return [b.date || '', b.client_name || '', b.phone || '', b.email || '', CAT_NAMES[b.category] || b.category || '', b.attendance || '', basePrice, discount, net, payLabel];
            });
            let csv = '﻿' + headers.join(';') + '\n';
            rows.forEach(r => { csv += r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';') + '\n'; });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = CENTER_ID + '_finances_' + todayStr() + '.csv';
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            alert('Erreur lors de l\'export');
        }
    };

    // ─── Start ───
    document.addEventListener('DOMContentLoaded', checkAuth);
})();
