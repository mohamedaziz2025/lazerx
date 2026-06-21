// ===== Configuration — LazerX Nabeul =====
const CENTER_TZ = 'Africa/Tunis';
const CENTER_LOCALE = 'fr-TN';
const CENTER_NAME = 'LazerX Nabeul';
const CENTER_CITY = 'Nabeul';
const CURRENT_CENTER = 'nabeul';
const CURRENCY = 'DT';

const API = {
  WEEK: '/.netlify/functions/week',
  CREATE: '/.netlify/functions/create-booking',
  CANCEL: '/.netlify/functions/cancel-booking',
  MOVE: '/.netlify/functions/move-booking',
  UPDATE: '/.netlify/functions/update-booking'
};

const STRINGS = {
  DAYS: ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],
  CATEGORIES: {
    tabac: 'Arrêt du tabac',
    drogue: 'Sevrage drogue',
    drogue_dure: 'Sevrage drogues dures',
    drogue_douce: 'Sevrage drogues douces',
    renforcement: 'Renforcement (gratuit)'
  },
  ERRORS: {
    REQUIRED_FIELDS: 'Veuillez remplir tous les champs obligatoires',
    PHONE_FORMAT: 'Format de téléphone invalide',
    SLOT_TAKEN: 'Créneau déjà réservé',
    NETWORK_ERROR: 'Erreur de connexion',
    UNKNOWN_ERROR: 'Une erreur est survenue'
  },
  SUCCESS: {
    BOOKING_CREATED: 'Rendez-vous créé avec succès',
    BOOKING_CANCELLED: 'Rendez-vous annulé avec succès'
  },
  CONFIRM: {
    CANCEL_BOOKING: 'Êtes-vous sûr de vouloir annuler ce rendez-vous ?'
  }
};

// ===== Time Slots =====
function generateTimeSlots() {
  const slots = { lundi:[], mardi:[], mercredi:[], jeudi:[], vendredi:[], samedi:[] };
  Object.keys(slots).forEach(day => {
    for (let hour = 8; hour < 20; hour++) {
      slots[day].push(`${hour.toString().padStart(2,'0')}:00-${hour.toString().padStart(2,'0')}:30`);
      slots[day].push(`${hour.toString().padStart(2,'0')}:30-${(hour+1).toString().padStart(2,'0')}:00`);
    }
  });
  return slots;
}
const TIME_SLOTS = generateTimeSlots();

// ===== Global State =====
let currentWeekStart = null;
let currentBookings = [];
let isSubmitting = false;
let draggedBooking = null;
let draggedElement = null;
let pendingDuplicateData = null;
let supabaseClient = null;

// ===== Date Utilities =====
function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0,0,0,0);
  return monday;
}

function formatDate(date) {
  return new Intl.DateTimeFormat(CENTER_LOCALE, { day:'2-digit', month:'2-digit', year:'numeric', timeZone:CENTER_TZ }).format(date);
}

function toDateISO(date) {
  return date.toLocaleDateString('sv-SE', { timeZone: CENTER_TZ });
}

function isSlotInPast(date, timeSlot) {
  const now = new Date();
  const [startTime] = timeSlot.split('-');
  const [hours, minutes] = startTime.split(':');
  const slotDate = new Date(date);
  slotDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  const nowLocal = new Date(now.toLocaleString('sv-SE', { timeZone: CENTER_TZ }));
  return slotDate < nowLocal;
}

// ===== Calendar Generation =====
function generateWeekDates(weekStart) {
  const dates = [];
  for (let i = 0; i < 6; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    dates.push(date);
  }
  return dates;
}

function renderCalendar() {
  const calendar = document.getElementById('calendar');
  const weekDates = generateWeekDates(currentWeekStart);
  calendar.innerHTML = '';
  if (window.innerWidth <= 768) { renderMobileCalendar(calendar, weekDates); } else { renderDesktopCalendar(calendar, weekDates); }
}

function renderDesktopCalendar(calendar, weekDates) {
  calendar.className = 'calendar';
  const headerHour = document.createElement('div');
  headerHour.className = 'calendar-header';
  headerHour.textContent = 'Heures';
  calendar.appendChild(headerHour);
  weekDates.forEach((date, dayIndex) => {
    const headerDay = document.createElement('div');
    headerDay.className = 'calendar-header';
    headerDay.textContent = `${STRINGS.DAYS[dayIndex]} ${formatDate(date)}`;
    calendar.appendChild(headerDay);
  });
  const allSlots = [...new Set(Object.values(TIME_SLOTS).flat())].sort();
  allSlots.forEach(timeSlot => {
    const hourCell = document.createElement('div');
    hourCell.className = 'calendar-hour';
    hourCell.textContent = timeSlot;
    calendar.appendChild(hourCell);
    weekDates.forEach((date, dayIndex) => {
      const dayKey = STRINGS.DAYS[dayIndex].toLowerCase();
      const daySlots = TIME_SLOTS[dayKey] || [];
      const cell = document.createElement('div');
      cell.className = 'calendar-cell';
      if (daySlots.includes(timeSlot)) {
        const dateStr = date.toLocaleDateString('sv-SE', { timeZone: CENTER_TZ });
        const isPast = isSlotInPast(date, timeSlot);
        const booking = findBookingForSlot(dateStr, timeSlot);
        if (booking) {
          cell.className += ' cell--booked';
          if (isPast) { cell.className += ' cell--past'; } else { cell.className += ' calendar-cell--draggable'; cell.setAttribute('draggable','true'); }
          cell.dataset.bookingId = booking.id;
          const bookingStartTime = new Date(booking.slot_start_utc).toLocaleTimeString('en-GB',{ timeZone:CENTER_TZ, hour12:false, hour:'2-digit', minute:'2-digit' });
          const [slotStartTime] = timeSlot.split('-');
          const isFirstSlot = bookingStartTime === slotStartTime;
          if (isFirstSlot) {
            cell.innerHTML = `<div class="booking-info"><div>${booking.client_name}</div><div class="session-duration">${booking.session_duration||60} min</div><div class="session-type">${booking.session_type||'solo'}</div><span class="category-badge category-badge--${booking.category}">${STRINGS.CATEGORIES[booking.category]}</span></div>`;
          } else {
            cell.innerHTML = `<div class="booking-info booking-continuation"><div>\u21b3 ${booking.client_name}</div><small>Suite</small></div>`;
          }
          cell.addEventListener('click', () => showBookingDetails(booking));
          if (!isPast) { setupDragEvents(cell, booking, dateStr, timeSlot); setupEditShortcuts(cell, booking); }
        } else if (isPast) {
          cell.className += ' cell--past';
        } else {
          cell.className += ' cell--free';
          cell.textContent = 'Libre';
          cell.addEventListener('click', () => openBookingModal(dateStr, timeSlot));
        }
        cell.setAttribute('tabindex', isPast ? '-1' : '0');
        if (!isPast) { cell.addEventListener('keydown', (e) => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); cell.click(); } }); }
      } else {
        cell.style.background = '#f5f5f4';
        cell.style.cursor = 'not-allowed';
      }
      calendar.appendChild(cell);
    });
  });
}

function renderMobileCalendar(calendar, weekDates) {
  calendar.className = 'calendar mobile';
  weekDates.forEach((date, dayIndex) => {
    const dayKey = STRINGS.DAYS[dayIndex].toLowerCase();
    const daySlots = TIME_SLOTS[dayKey] || [];
    const dayContainer = document.createElement('div');
    dayContainer.className = 'mobile-day';
    const dayHeader = document.createElement('div');
    dayHeader.className = 'mobile-day-header';
    dayHeader.textContent = `${STRINGS.DAYS[dayIndex]} ${formatDate(date)}`;
    dayContainer.appendChild(dayHeader);
    const slotsContainer = document.createElement('div');
    slotsContainer.className = 'mobile-slots';
    daySlots.forEach(timeSlot => {
      const dateStr = date.toLocaleDateString('sv-SE', { timeZone: CENTER_TZ });
      const isPast = isSlotInPast(date, timeSlot);
      const booking = findBookingForSlot(dateStr, timeSlot);
      const slot = document.createElement('div');
      slot.className = 'mobile-slot';
      if (booking) {
        slot.className += ' cell--booked';
        if (isPast) slot.className += ' cell--past';
        const bookingStartTime = new Date(booking.slot_start_utc).toLocaleTimeString('en-GB',{ timeZone:CENTER_TZ, hour12:false, hour:'2-digit', minute:'2-digit' });
        const [slotStartTime] = timeSlot.split('-');
        if (bookingStartTime === slotStartTime) {
          slot.innerHTML = `<div class="booking-info"><div>${timeSlot}</div><div>${booking.client_name}</div><div class="session-duration">${booking.session_duration||60} min</div><span class="category-badge category-badge--${booking.category}">${STRINGS.CATEGORIES[booking.category]}</span></div>`;
        } else {
          slot.innerHTML = `<div class="booking-info booking-continuation"><div>${timeSlot}</div><div>\u21b3 ${booking.client_name}</div><small>Suite</small></div>`;
        }
        slot.addEventListener('click', () => showBookingDetails(booking));
      } else if (isPast) {
        slot.className += ' cell--past';
      } else {
        slot.className += ' cell--free';
        slot.innerHTML = `<div>${timeSlot}</div><div>Libre</div>`;
        slot.addEventListener('click', () => openBookingModal(dateStr, timeSlot));
      }
      slotsContainer.appendChild(slot);
    });
    dayContainer.appendChild(slotsContainer);
    calendar.appendChild(dayContainer);
  });
}

function findBookingForSlot(date, timeSlot) {
  const [slotStartTime, slotEndTime] = timeSlot.split('-');
  return currentBookings.find(booking => {
    if (booking.status !== 'booked') return false;
    const bookingDate = new Date(booking.slot_start_utc).toLocaleDateString('sv-SE', { timeZone: CENTER_TZ });
    if (bookingDate !== date) return false;
    const bookingStartTime = new Date(booking.slot_start_utc).toLocaleTimeString('en-GB',{ timeZone:CENTER_TZ, hour12:false, hour:'2-digit', minute:'2-digit' });
    const bookingEndTime = new Date(booking.slot_end_utc).toLocaleTimeString('en-GB',{ timeZone:CENTER_TZ, hour12:false, hour:'2-digit', minute:'2-digit' });
    const slotStart = timeToMinutes(slotStartTime);
    const slotEnd = timeToMinutes(slotEndTime);
    const bookingStart = timeToMinutes(bookingStartTime);
    const bookingEnd = timeToMinutes(bookingEndTime);
    return bookingStart < slotEnd && bookingEnd > slotStart;
  });
}

function timeToMinutes(timeStr) { const [h,m]=timeStr.split(':').map(Number); return h*60+m; }

// ===== Week Navigation =====
function updateWeekTitle() {
  const weekEnd = new Date(currentWeekStart);
  weekEnd.setDate(currentWeekStart.getDate() + 5);
  document.getElementById('weekTitle').textContent = `Planning ${CENTER_NAME} \u2014 Semaine du ${formatDate(currentWeekStart)} au ${formatDate(weekEnd)}`;
}
function navigateWeek(direction) { const nw = new Date(currentWeekStart); nw.setDate(currentWeekStart.getDate()+(direction*7)); currentWeekStart=nw; updateWeekTitle(); loadWeekBookings(); }
function goToCurrentWeek() { currentWeekStart = getWeekStart(); updateWeekTitle(); loadWeekBookings(); }

// ===== API =====
async function apiCall(url, options = {}) {
  try {
    const response = await fetch(url, { headers: { 'Content-Type':'application/json', ...options.headers }, ...options });
    if (response.status === 409) { const d = await response.json(); return { conflict:true, ...d }; }
    if (!response.ok) { const e = await response.json().catch(()=>({})); throw new Error(e.message || `HTTP ${response.status}`); }
    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    if (error.name === 'TypeError' && error.message.includes('fetch')) throw new Error(STRINGS.ERRORS.NETWORK_ERROR);
    throw error;
  }
}

async function loadWeekBookings() {
  try {
    const startDate = currentWeekStart.toLocaleDateString('sv-SE', { timeZone: CENTER_TZ });
    const data = await apiCall(`${API.WEEK}?start=${startDate}&center=${CURRENT_CENTER}`);
    currentBookings = data.bookings || [];
    renderCalendar();
  } catch (error) { showToast(error.message||STRINGS.ERRORS.UNKNOWN_ERROR,'error'); renderCalendar(); }
}

async function createBooking(bookingData) {
  const data = await apiCall(API.CREATE, { method:'POST', body:JSON.stringify(bookingData) });
  if (data.conflict === 'duplicate_client') return data;
  if (data.success) { currentBookings.push(data.booking); renderCalendar(); return data; }
  else throw new Error(data.message||STRINGS.ERRORS.UNKNOWN_ERROR);
}

async function cancelBooking(bookingId) {
  const data = await apiCall(API.CANCEL, { method:'POST', body:JSON.stringify({ id:bookingId }) });
  if (data.success) { const i = currentBookings.findIndex(b=>b.id===bookingId); if(i!==-1) currentBookings[i].status='cancelled'; renderCalendar(); return data; }
  else throw new Error(data.message||STRINGS.ERRORS.UNKNOWN_ERROR);
}

// ===== Modals =====
function openBookingModal(date, timeSlot) {
  const modal = document.getElementById('bookingModal');
  const form = document.getElementById('bookingForm');
  form.reset(); updateCharCount();
  const dateObj = new Date(date);
  const dayName = STRINGS.DAYS[dateObj.getDay()-1];
  document.getElementById('slotInfo').textContent = `${dayName} ${formatDate(dateObj)} de ${timeSlot}`;
  form.dataset.date = date; form.dataset.timeSlot = timeSlot;
  modal.showModal(); document.getElementById('clientName').focus();
}
function closeBookingModal() { document.getElementById('bookingModal').close(); }

function showBookingDetails(booking) {
  const modal = document.getElementById('detailsModal');
  const startTime = new Date(booking.slot_start_utc).toLocaleTimeString(CENTER_LOCALE,{ timeZone:CENTER_TZ, hour:'2-digit', minute:'2-digit' });
  const endTime = new Date(booking.slot_end_utc).toLocaleTimeString(CENTER_LOCALE,{ timeZone:CENTER_TZ, hour:'2-digit', minute:'2-digit' });
  const date = new Date(booking.slot_start_utc).toLocaleDateString(CENTER_LOCALE,{ timeZone:CENTER_TZ, weekday:'long', day:'numeric', month:'long', year:'numeric' });
  document.getElementById('bookingDetails').innerHTML = `<dl><dt>Date et heure :</dt><dd>${date} de ${startTime} à ${endTime}</dd><dt>Nom :</dt><dd>${booking.client_name}</dd><dt>Téléphone :</dt><dd>${booking.phone}</dd><dt>Catégorie :</dt><dd><span class="category-badge category-badge--${booking.category}">${STRINGS.CATEGORIES[booking.category]}</span></dd>${booking.notes?`<dt>Notes :</dt><dd>${booking.notes}</dd>`:''}<dt>Statut :</dt><dd><span class="status-badge status-badge--${booking.status}">${booking.status==='booked'?'Confirmé':'Annulé'}</span></dd></dl>`;
  document.getElementById('cancelBookingBtn').dataset.bookingId = booking.id;
  modal.showModal();
}
function closeDetailsModal() { document.getElementById('detailsModal').close(); }

function validateBookingForm(formData) {
  const errors = [];
  if (!formData.client_name.trim()) errors.push('Le nom est obligatoire');
  if (!formData.phone.trim()) errors.push('Le téléphone est obligatoire');
  if (!formData.category) errors.push('La catégorie est obligatoire');
  return errors;
}

async function handleBookingSubmit(event) {
  event.preventDefault();
  if (isSubmitting) return;
  isSubmitting = true;
  const form = event.target;
  const submitBtn = document.getElementById('submitBooking');
  const originalText = submitBtn.textContent;
  try {
    submitBtn.textContent = 'Création...'; submitBtn.disabled = true;
    const formData = new FormData(form);
    const [startTime] = form.dataset.timeSlot.split('-');
    const duration = parseInt(formData.get('sessionDuration'));
    const [startHour, startMin] = startTime.split(':');
    const startDate = new Date(); startDate.setHours(parseInt(startHour), parseInt(startMin), 0, 0);
    const endDate = new Date(startDate.getTime()+(duration*60000));
    const calculatedEndTime = `${endDate.getHours().toString().padStart(2,'0')}:${endDate.getMinutes().toString().padStart(2,'0')}`;
    const bookingData = {
      client_name: formData.get('clientName').trim(),
      phone: formData.get('phone').trim(),
      category: formData.get('category'),
      notes: formData.get('notes')?.trim()||'',
      session_duration: duration,
      session_type: formData.get('sessionType'),
      slot_start_local: `${form.dataset.date}T${startTime}:00`,
      slot_end_local: `${form.dataset.date}T${calculatedEndTime}:00`,
      center: CURRENT_CENTER
    };
    const errors = validateBookingForm(bookingData);
    if (errors.length > 0) { showToast(errors.join(', '),'error'); return; }
    const result = await createBooking(bookingData);
    if (result.conflict === 'duplicate_client') {
      pendingDuplicateData = { bookingData, existingBooking:result.existing_booking, matchBy:result.match_by };
      closeBookingModal(); showDuplicateModal(result); return;
    }
    closeBookingModal(); showToast(STRINGS.SUCCESS.BOOKING_CREATED,'success');
  } catch (error) { showToast(error.message||STRINGS.ERRORS.UNKNOWN_ERROR,'error'); }
  finally { submitBtn.textContent=originalText; submitBtn.disabled=false; isSubmitting=false; }
}

function showCancelConfirmation(bookingId) {
  const modal = document.getElementById('confirmModal');
  document.getElementById('confirmMessage').textContent = STRINGS.CONFIRM.CANCEL_BOOKING;
  document.getElementById('confirmYes').dataset.bookingId = bookingId;
  modal.showModal();
}

async function handleBookingCancellation(bookingId) {
  try { await cancelBooking(bookingId); closeDetailsModal(); document.getElementById('confirmModal').close(); showToast(STRINGS.SUCCESS.BOOKING_CANCELLED,'success'); }
  catch (error) { showToast(error.message||STRINGS.ERRORS.UNKNOWN_ERROR,'error'); }
}

// ===== Toast =====
function showToast(message, type='info') {
  const toast = document.getElementById('toast');
  toast.textContent = message; toast.className = `toast ${type}`;
  toast.offsetHeight; toast.classList.add('show');
  setTimeout(() => { toast.classList.remove('show'); }, 4000);
}

function updateCharCount() {
  const notes = document.getElementById('notes');
  const counter = document.querySelector('.char-count');
  if (notes && counter) { counter.textContent = `${notes.value.length}/140`; counter.style.color = notes.value.length>140?'var(--danger)':'var(--gray-500)'; }
}

// ===== Drag and Drop =====
function setupDragEvents(element, booking, dateStr, timeSlot) {
  element.addEventListener('dragstart', (e) => {
    draggedBooking = booking; draggedElement = element;
    element.classList.add('calendar-cell--dragging');
    e.dataTransfer.setData('text/plain', booking.id);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => { document.querySelectorAll('.calendar-cell.cell--free').forEach(cell => { cell.classList.add('calendar-cell--drop-target'); setupDropEvents(cell); }); }, 0);
  });
  element.addEventListener('dragend', () => {
    element.classList.remove('calendar-cell--dragging');
    document.querySelectorAll('.calendar-cell--drop-target').forEach(cell => { cell.classList.remove('calendar-cell--drop-target'); removeDropEvents(cell); });
    draggedBooking = null; draggedElement = null;
  });
}

function setupEditShortcuts(element, booking) {
  let pressTimer;
  element.addEventListener('touchstart', (e) => { pressTimer = setTimeout(() => { e.preventDefault(); showEditModal(booking); }, 500); });
  element.addEventListener('touchend', () => { clearTimeout(pressTimer); });
  element.addEventListener('touchmove', () => { clearTimeout(pressTimer); });
  element.addEventListener('contextmenu', (e) => { e.preventDefault(); showEditModal(booking); });
}

function setupDropEvents(el) { el.addEventListener('dragover',handleDragOver); el.addEventListener('drop',handleDrop); el.addEventListener('dragenter',handleDragEnter); el.addEventListener('dragleave',handleDragLeave); }
function removeDropEvents(el) { el.removeEventListener('dragover',handleDragOver); el.removeEventListener('drop',handleDrop); el.removeEventListener('dragenter',handleDragEnter); el.removeEventListener('dragleave',handleDragLeave); }
function handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect='move'; }
function handleDragEnter(e) { e.preventDefault(); this.style.backgroundColor='rgba(42,90,176,0.2)'; }
function handleDragLeave() { this.style.backgroundColor=''; }

function handleDrop(e) {
  e.preventDefault(); this.style.backgroundColor='';
  if (!draggedBooking) return;
  const targetDate = getDateFromCalendarCell(this);
  const targetTimeSlot = getTimeSlotFromCalendarCell(this);
  if (!targetDate||!targetTimeSlot) { showToast('Impossible de déterminer le créneau','error'); return; }
  const conflict = findBookingForSlot(targetDate, targetTimeSlot);
  if (conflict) showConflictResolutionModal(draggedBooking, conflict, targetDate, targetTimeSlot);
  else moveBooking(draggedBooking, targetDate, targetTimeSlot);
}

function getDateFromCalendarCell(cell) {
  const calendar = document.getElementById('calendar');
  const allCells = Array.from(calendar.children);
  const cellIndex = allCells.indexOf(cell);
  if (cellIndex===-1) return null;
  const colIndex = cellIndex%7;
  if (colIndex===0) return null;
  const dayIndex = colIndex-1;
  const weekDates = generateWeekDates(currentWeekStart);
  return weekDates[dayIndex]?.toLocaleDateString('sv-SE', { timeZone: CENTER_TZ });
}

function getTimeSlotFromCalendarCell(cell) {
  const calendar = document.getElementById('calendar');
  const allCells = Array.from(calendar.children);
  const cellIndex = allCells.indexOf(cell);
  if (cellIndex===-1) return null;
  const rowIndex = Math.floor(cellIndex/7);
  if (rowIndex===0) return null;
  const allSlots = [...new Set(Object.values(TIME_SLOTS).flat())].sort();
  return allSlots[rowIndex-1];
}

function showConflictResolutionModal(movingBooking, conflictingBooking, targetDate, targetTimeSlot) {
  const modal = document.getElementById('conflictModal');
  const targetDateObj = new Date(targetDate);
  const dayName = STRINGS.DAYS[targetDateObj.getDay()-1];
  document.getElementById('conflictDescription').textContent = `Vous tentez de déplacer la séance de ${movingBooking.client_name} vers ${dayName} ${formatDate(targetDateObj)} ${targetTimeSlot}, mais ce créneau est occupé par ${conflictingBooking.client_name}.`;
  document.getElementById('movingSession').innerHTML = `<strong>${movingBooking.client_name}</strong><br><small>${movingBooking.session_duration||60} min</small><br><span class="category-badge category-badge--${movingBooking.category}">${STRINGS.CATEGORIES[movingBooking.category]}</span>`;
  document.getElementById('conflictingSession').innerHTML = `<strong>${conflictingBooking.client_name}</strong><br><small>${conflictingBooking.session_duration||60} min</small><br><span class="category-badge category-badge--${conflictingBooking.category}">${STRINGS.CATEGORIES[conflictingBooking.category]}</span>`;
  modal.dataset.movingBookingId = movingBooking.id; modal.dataset.conflictingBookingId = conflictingBooking.id;
  modal.dataset.targetDate = targetDate; modal.dataset.targetTimeSlot = targetTimeSlot;
  modal.showModal();
}

async function moveBooking(booking, targetDate, targetTimeSlot) {
  try {
    const [startTime] = targetTimeSlot.split('-');
    const duration = booking.session_duration||60;
    const [sh,sm] = startTime.split(':');
    const sd = new Date(); sd.setHours(parseInt(sh),parseInt(sm),0,0);
    const ed = new Date(sd.getTime()+(duration*60000));
    const calcEnd = `${ed.getHours().toString().padStart(2,'0')}:${ed.getMinutes().toString().padStart(2,'0')}`;
    const moveResponse = await apiCall(API.MOVE, { method:'POST', body:JSON.stringify({ booking_id:booking.id, new_slot_start_local:`${targetDate}T${startTime}:00`, new_slot_end_local:`${targetDate}T${calcEnd}:00` }) });
    if (moveResponse.success) { showToast('Séance déplacée avec succès','success'); await loadWeekBookings(); }
    else throw new Error(moveResponse.message||'Échec du déplacement');
  } catch (error) { showToast(`Erreur: ${error.message}`,'error'); loadWeekBookings(); }
}

async function handleConflictResolution(resolution) {
  const modal = document.getElementById('conflictModal');
  const movingBooking = currentBookings.find(b=>b.id===modal.dataset.movingBookingId);
  const conflictingBooking = currentBookings.find(b=>b.id===modal.dataset.conflictingBookingId);
  if (!movingBooking||!conflictingBooking) { showToast('Erreur: séances introuvables','error'); modal.close(); return; }
  try {
    if (resolution==='share') { await moveBooking(movingBooking,modal.dataset.targetDate,modal.dataset.targetTimeSlot); }
    else if (resolution==='moveDown') {
      const dayKey = STRINGS.DAYS[new Date(modal.dataset.targetDate).getDay()-1].toLowerCase();
      const daySlots = TIME_SLOTS[dayKey]||[];
      const idx = daySlots.indexOf(modal.dataset.targetTimeSlot);
      let nextSlot = null;
      for (let i=idx+1; i<daySlots.length; i++) { if (!findBookingForSlot(modal.dataset.targetDate,daySlots[i])) { nextSlot=daySlots[i]; break; } }
      if (!nextSlot) throw new Error('Aucun créneau disponible');
      await moveBooking(conflictingBooking,modal.dataset.targetDate,nextSlot);
      await moveBooking(movingBooking,modal.dataset.targetDate,modal.dataset.targetTimeSlot);
    }
    else if (resolution==='replace') {
      await cancelBooking(conflictingBooking.id);
      await moveBooking(movingBooking,modal.dataset.targetDate,modal.dataset.targetTimeSlot);
    }
    modal.close(); renderCalendar();
  } catch (error) { showToast(`Erreur: ${error.message}`,'error'); }
}

// ===== Duplicate Modal =====
function showDuplicateModal(conflictData) {
  const modal = document.getElementById('duplicateModal');
  document.getElementById('duplicateDescription').textContent = `Ce client existe déjà (correspondance par ${conflictData.match_by==='phone'?'numéro de téléphone':'nom'}).`;
  const existing = conflictData.existing_booking;
  const startLocal = new Date(existing.slot_start_utc).toLocaleString(CENTER_LOCALE,{ timeZone:CENTER_TZ, weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit' });
  document.getElementById('existingBookingInfo').innerHTML = `<div><strong>${existing.client_name}</strong></div><div>${existing.phone}</div><div>${startLocal}</div>`;
  modal.showModal();
}
function closeDuplicateModal() { document.getElementById('duplicateModal').close(); pendingDuplicateData=null; }

async function handleMoveOld() {
  if (!pendingDuplicateData) return;
  try {
    const { bookingData, existingBooking } = pendingDuplicateData;
    const r = await apiCall(API.MOVE, { method:'POST', body:JSON.stringify({ booking_id:existingBooking.id, new_slot_start_local:bookingData.slot_start_local, new_slot_end_local:bookingData.slot_end_local }) });
    if (r.success) { closeDuplicateModal(); showToast('Rendez-vous existant déplacé','success'); loadWeekBookings(); }
    else throw new Error(r.message);
  } catch (error) { showToast(error.message||STRINGS.ERRORS.UNKNOWN_ERROR,'error'); }
}

async function handleKeepBoth() {
  if (!pendingDuplicateData) return;
  try {
    const r = await createBooking({ ...pendingDuplicateData.bookingData, force_create:true });
    if (r.success) { closeDuplicateModal(); showToast('Deuxième rendez-vous créé','success'); }
    else throw new Error(r.message);
  } catch (error) { showToast(error.message||STRINGS.ERRORS.UNKNOWN_ERROR,'error'); }
}

// ===== Edit Booking =====
function showEditModal(booking) {
  const modal = document.getElementById('editModal');
  document.getElementById('editClientName').value = booking.client_name;
  document.getElementById('editPhone').value = booking.phone;
  document.getElementById('editSessionDuration').value = booking.session_duration||60;
  document.getElementById('editSessionType').value = booking.session_type||'solo';
  document.getElementById('editNotes').value = booking.notes||'';
  document.getElementById('editBookingId').value = booking.id;
  document.querySelectorAll('.edit-duration-btn').forEach(btn => { btn.classList.toggle('active', btn.dataset.duration===String(booking.session_duration||60)); });
  document.querySelectorAll('.edit-type-btn').forEach(btn => { btn.classList.toggle('active', btn.dataset.type===(booking.session_type||'solo')); });
  const catRadio = document.querySelector(`input[name="editCategory"][value="${booking.category}"]`);
  if (catRadio) catRadio.checked = true;
  const cc = document.querySelector('.edit-char-count'); if(cc) cc.textContent = `${(booking.notes||'').length}/140`;
  modal.showModal();
}
function closeEditModal() { document.getElementById('editModal').close(); }

async function handleEditSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const updateData = {
    booking_id: document.getElementById('editBookingId').value,
    client_name: formData.get('editClientName').trim(),
    phone: formData.get('editPhone').trim(),
    category: formData.get('editCategory'),
    notes: formData.get('editNotes')?.trim()||'',
    session_duration: parseInt(document.getElementById('editSessionDuration').value),
    session_type: document.getElementById('editSessionType').value
  };
  try {
    const r = await apiCall(API.UPDATE, { method:'POST', body:JSON.stringify(updateData) });
    if (r.success) { closeEditModal(); closeDetailsModal(); showToast('Rendez-vous modifié','success'); loadWeekBookings(); }
    else throw new Error(r.message);
  } catch (error) { showToast(error.message||STRINGS.ERRORS.UNKNOWN_ERROR,'error'); }
}

// ===== Switches =====
function initializeSwitches() {
  document.querySelectorAll('.duration-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const cat = document.querySelector('input[name="category"]:checked')?.value;
      if (cat==='renforcement'&&e.target.dataset.duration!=='30') { showToast('Le renforcement doit être de 30 minutes','error'); return; }
      document.querySelectorAll('.duration-btn').forEach(b=>b.classList.remove('active'));
      e.target.classList.add('active');
      document.getElementById('sessionDuration').value = e.target.dataset.duration;
    });
  });
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.type-btn').forEach(b=>b.classList.remove('active'));
      e.target.classList.add('active');
      document.getElementById('sessionType').value = e.target.dataset.type;
      if (e.target.dataset.type==='duo') {
        document.querySelectorAll('.duration-btn').forEach(b=>b.classList.remove('active'));
        document.querySelector('[data-duration="90"]').classList.add('active');
        document.getElementById('sessionDuration').value = '90';
      }
    });
  });
  document.querySelectorAll('input[name="category"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value==='renforcement') {
        document.querySelectorAll('.duration-btn').forEach(b=>b.classList.remove('active'));
        const btn30 = document.querySelector('[data-duration="30"]');
        if(btn30) { btn30.classList.add('active'); document.getElementById('sessionDuration').value='30'; }
        showToast('Renforcement: séance gratuite de 30 minutes','info');
      }
    });
  });
}

function initializeEditSwitches() {
  document.querySelectorAll('.edit-duration-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const cat = document.querySelector('input[name="editCategory"]:checked')?.value;
      if (cat==='renforcement'&&e.target.dataset.duration!=='30') { showToast('Le renforcement doit être de 30 minutes','error'); return; }
      document.querySelectorAll('.edit-duration-btn').forEach(b=>b.classList.remove('active'));
      e.target.classList.add('active');
      document.getElementById('editSessionDuration').value = e.target.dataset.duration;
    });
  });
  document.querySelectorAll('.edit-type-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.edit-type-btn').forEach(b=>b.classList.remove('active'));
      e.target.classList.add('active');
      document.getElementById('editSessionType').value = e.target.dataset.type;
      if (e.target.dataset.type==='duo') {
        document.querySelectorAll('.edit-duration-btn').forEach(b=>b.classList.remove('active'));
        document.querySelector('.edit-duration-btn[data-duration="90"]')?.classList.add('active');
        document.getElementById('editSessionDuration').value='90';
      }
    });
  });
  document.querySelectorAll('input[name="editCategory"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.value==='renforcement') {
        document.querySelectorAll('.edit-duration-btn').forEach(b=>b.classList.remove('active'));
        const btn30 = document.querySelector('.edit-duration-btn[data-duration="30"]');
        if(btn30) { btn30.classList.add('active'); document.getElementById('editSessionDuration').value='30'; }
        showToast('Renforcement: séance gratuite de 30 minutes','info');
      }
    });
  });
  const editNotes = document.getElementById('editNotes');
  if(editNotes) editNotes.addEventListener('input', (e) => { const cc=document.querySelector('.edit-char-count'); if(cc) cc.textContent=`${e.target.value.length}/140`; });
}

// ===== Event Listeners =====
function initializeEventListeners() {
  document.getElementById('prevWeek').addEventListener('click', ()=>navigateWeek(-1));
  document.getElementById('nextWeek').addEventListener('click', ()=>navigateWeek(1));
  document.getElementById('currentWeek').addEventListener('click', goToCurrentWeek);
  initializeSwitches();
  document.getElementById('closeModal').addEventListener('click', closeBookingModal);
  document.getElementById('cancelBooking').addEventListener('click', closeBookingModal);
  document.getElementById('closeDetailsModal').addEventListener('click', closeDetailsModal);
  document.getElementById('closeDetails').addEventListener('click', closeDetailsModal);
  document.getElementById('bookingForm').addEventListener('submit', handleBookingSubmit);
  document.getElementById('notes').addEventListener('input', updateCharCount);
  document.getElementById('cancelBookingBtn').addEventListener('click', (e) => { showCancelConfirmation(e.target.dataset.bookingId); });
  document.getElementById('confirmNo').addEventListener('click', ()=>{ document.getElementById('confirmModal').close(); });
  document.getElementById('confirmYes').addEventListener('click', (e)=>{ handleBookingCancellation(e.target.dataset.bookingId); });
  document.getElementById('closeConflictModal').addEventListener('click', ()=>{ document.getElementById('conflictModal').close(); });
  document.getElementById('shareTimeBtn').addEventListener('click', ()=>handleConflictResolution('share'));
  document.getElementById('moveDownBtn').addEventListener('click', ()=>handleConflictResolution('moveDown'));
  document.getElementById('replaceBtn').addEventListener('click', ()=>handleConflictResolution('replace'));
  document.getElementById('cancelMoveBtn').addEventListener('click', ()=>{ document.getElementById('conflictModal').close(); });
  document.getElementById('closeDuplicateModal').addEventListener('click', closeDuplicateModal);
  document.getElementById('cancelDuplicateBtn').addEventListener('click', closeDuplicateModal);
  document.getElementById('moveOldBtn').addEventListener('click', handleMoveOld);
  document.getElementById('keepBothBtn').addEventListener('click', handleKeepBoth);
  document.getElementById('editBookingBtn').addEventListener('click', ()=>{
    const bookingId = document.getElementById('cancelBookingBtn').dataset.bookingId;
    const booking = currentBookings.find(b=>b.id===bookingId);
    if(booking) { closeDetailsModal(); showEditModal(booking); }
  });
  document.getElementById('closeEditModal').addEventListener('click', closeEditModal);
  document.getElementById('cancelEdit').addEventListener('click', closeEditModal);
  document.getElementById('editForm').addEventListener('submit', handleEditSubmit);
  initializeEditSwitches();
  [document.getElementById('bookingModal'),document.getElementById('detailsModal'),document.getElementById('confirmModal'),document.getElementById('conflictModal')].forEach(modal => {
    modal.addEventListener('click', (e) => { if(e.target===modal) modal.close(); });
  });
  document.addEventListener('keydown', (e) => { if(e.key==='Escape') document.querySelectorAll('dialog[open]').forEach(m=>m.close()); });
  window.addEventListener('resize', ()=>{ clearTimeout(window.resizeTimeout); window.resizeTimeout=setTimeout(renderCalendar,250); });
}

// ===== Realtime (polling) =====
function initializeRealtime() {
  setInterval(loadWeekBookings, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadWeekBookings(); });
}

// ===== Auth =====
const _AUTH_KEY = 'lazerx_nabeul_planning_auth';
const _AUTH_PIN = '062026';

function lockApp() {
  localStorage.removeItem(_AUTH_KEY);
  location.reload();
}

function checkAuth(onSuccess) {
  if (localStorage.getItem(_AUTH_KEY) === 'true') { onSuccess(); return; }
  const overlay = document.getElementById('authOverlay');
  overlay.style.display = 'flex';
  const input = document.getElementById('pinInput');
  input.focus();
  input.addEventListener('input', function() {
    if (this.value.length === 6) {
      if (this.value === _AUTH_PIN) {
        localStorage.setItem(_AUTH_KEY, 'true');
        overlay.style.display = 'none';
        onSuccess();
      } else {
        document.getElementById('pinError').style.display = 'block';
        this.value = '';
        setTimeout(() => document.getElementById('pinError').style.display = 'none', 2000);
        this.focus();
      }
    }
  });
}

// ===== Init =====
function init() {
  currentWeekStart = getWeekStart();
  updateWeekTitle();
  initializeEventListeners();
  loadWeekBookings();
  initializeRealtime();
}
document.addEventListener('DOMContentLoaded', () => checkAuth(init));
