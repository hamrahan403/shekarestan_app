

(function () {
  'use strict';

  // ---------- تنظیمات پایه ----------
  const TIERS = [
    { key: 'university', labelNotes: '📚 جزوه‌های دانشگاه', labelVideos: '🎓 کلاس‌های دانشگاه' },
    { key: 'treasury', labelNotes: '💎 گنجینه جزوات', labelVideos: '💎 گنجینه تدریس' },
  ];

  let activeTier = { notes: null, videos: null }; // null = هنوز دسته انتخاب نشده

  // ---------- کمکی: گرفتن لیست دروسِ یک دسته‌ی خاص ----------
  function getSubjectsForTier(type, tier) {
    // type: 'notes' | 'videos'
    const scope = `${type}-${tier}`;
    const items = type === 'videos' ? DATA.videos : DATA.notes;
    const namesFromItems = items.filter((i) => i.tier === tier).map((i) => i.subject);
    const namesFromSubjectsDoc = (DATA.subjects || [])
      .filter((s) => s.scope === scope)
      .map((s) => s.name);
    const names = [...new Set([...namesFromItems, ...namesFromSubjectsDoc])];
    return names.map((name) => ({
      name,
      icon: DATA.subjectIcons[name] || (type === 'videos' ? '🎬' : '📘'),
      count: items.filter((i) => i.subject === name && i.tier === tier).length,
    }));
  }

  // ---------- رندر صفحه‌ی انتخاب دسته (کلاس‌های دانشگاه | گنجینه) ----------
  function renderTierChooser(type, containerEl) {
    const labelKey = type === 'videos' ? 'labelVideos' : 'labelNotes';
    containerEl.innerHTML = TIERS.map(
      (t) => `
      <div class="ut-tier-card" onclick="UT.selectTier('${type}','${t.key}')">
        <div class="ut-tier-label">${t[labelKey]}</div>
      </div>`
    ).join('');
  }

  // ---------- رندر صفحه‌ی لیست درس‌های یک دسته ----------
  function renderSubjectsForTier(type, tier, containerEl) {
    const subjects = getSubjectsForTier(type, tier);
    const isAdmin = currentUser && currentUser.isAdmin;
    const addBtn = isAdmin
      ? `<button class="ut-add-subject-btn" onclick="UT.addSubjectPrompt('${type}','${tier}')">➕ افزودن درس جدید</button>`
      : '';

    const backBtn = `<button class="ut-add-subject-btn" onclick="UT.backToTierChooser('${type}')" style="background:var(--cream);">← بازگشت</button>`;
    containerEl.innerHTML =
      backBtn +
      addBtn +
      subjects
        .map(
          (s) => `
      <div class="ut-subject-card" onclick="UT.openSubject('${type}','${tier}','${escapeHtml(s.name)}')">
        ${
          isAdmin
            ? `<span class="admin-delete-icon" onclick="event.stopPropagation();UT.deleteSubjectPrompt('${type}','${tier}','${escapeHtml(s.name)}')">🗑</span>`
            : ''
        }
        <div class="ut-subject-icon">${s.icon}</div>
        <div class="ut-subject-name">${escapeHtml(s.name)}</div>
        <div class="ut-subject-count">${s.count} مورد</div>
      </div>`
        )
        .join('') || '<div class="ut-empty">هنوز درسی ثبت نشده</div>';
  }

  // ---------- رندر لیست آیتم‌های (جزوه/ویدیو) یک درس خاص ----------
  function renderItemsForSubject(type, tier, subject, containerEl) {
    const items = (type === 'videos' ? DATA.videos : DATA.notes).filter(
      (i) => i.subject === subject && i.tier === tier
    );
    const isAdmin = currentUser && currentUser.isAdmin;

    containerEl.innerHTML =
      items
        .map((item) => {
          if (type === 'videos') {
            return `
          <div class="ut-item-card" onclick="openVideo('${item.id}')">
            <div class="ut-item-thumb">${item.thumb || '🎬'}</div>
            <div class="ut-item-title">${escapeHtml(item.title)}</div>
            <div class="ut-item-meta">${escapeHtml(item.instructor)} • ⏱ ${item.duration || '۰۰:۰۰:۰۰'}</div>
            ${
              isAdmin
                ? `<div class="ut-admin-row">
                     <span onclick="event.stopPropagation();UT.editVideo('${item.id}')">✏️</span>
                     <span onclick="event.stopPropagation();deleteVideoAdmin('${item.id}')">🗑</span>
                   </div>`
                : ''
            }
          </div>`;
          }
          return `
          <div class="ut-item-card" onclick="openNoteDetail('${item.id}')">
            <div class="ut-item-title">${escapeHtml(item.title)}</div>
            <div class="ut-item-meta">${escapeHtml(item.instructor)} • نسخه ${item.version} • ${item.size}</div>
            ${
              isAdmin
                ? `<div class="ut-admin-row">
                     <span onclick="event.stopPropagation();editNoteAdmin('${item.id}')">✏️</span>
                     <span onclick="event.stopPropagation();deleteNoteAdmin('${item.id}')">🗑</span>
                   </div>`
                : ''
            }
          </div>`;
        })
        .join('') || '<div class="ut-empty">هنوز موردی ثبت نشده</div>';
  }

  // ---------- افزودن درس جدید (ادمین) ----------
  async function addSubjectPrompt(type, tier) {
    const name = prompt('نام درس جدید رو وارد کن:');
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    const scope = `${type}-${tier}`;
    try {
      await apiFs('set', 'subjects', {
        docId: `${scope}:${trimmed}`,
        data: { name: trimmed, icon: type === 'videos' ? '🎬' : '📘', scope, createdAtMs: Date.now() },
      });
      if (!DATA.subjects) DATA.subjects = [];
      DATA.subjects.push({ name: trimmed, icon: type === 'videos' ? '🎬' : '📘', scope });
      showToast('✅ درس اضافه شد');
      UT.refreshCurrentView();
    } catch (e) {
      showToast('⚠️ خطا: ' + (e.message || ''));
    }
  }

  async function deleteSubjectPrompt(type, tier, name) {
    const items = type === 'videos' ? DATA.videos : DATA.notes;
    const count = items.filter((i) => i.subject === name && i.tier === tier).length;
    if (count > 0) {
      showToast(`⚠️ این درس ${count} ${type === 'videos' ? 'ویدیو' : 'جزوه'} دارد، اول آن‌ها را حذف کن`);
      return;
    }
    if (!confirm(`درس «${name}» حذف شود؟`)) return;
    const scope = `${type}-${tier}`;
    try {
      await apiFs('delete', 'subjects', { docId: `${scope}:${name}` });
      DATA.subjects = (DATA.subjects || []).filter((s) => !(s.name === name && s.scope === scope));
      showToast('✅ درس حذف شد');
      UT.refreshCurrentView();
    } catch (e) {
      showToast('⚠️ خطا: ' + (e.message || ''));
    }
  }

  // ---------- ناوبری بین حالت‌ها ----------
  function selectTier(type, tier) {
    activeTier[type] = tier;
    UT.refreshCurrentView(type);
  }

  function openSubject(type, tier, subject) {
    const containerId = type === 'videos' ? 'ut-videos-items' : 'ut-notes-items';
    const listView = type === 'videos' ? 'ut-videos-subjects' : 'ut-notes-subjects';
    const itemsView = type === 'videos' ? 'ut-videos-items-view' : 'ut-notes-items-view';
    document.getElementById(listView).style.display = 'none';
    document.getElementById(itemsView).style.display = 'block';
    document.getElementById(itemsView.replace('-view', '-title')).textContent = subject;
    renderItemsForSubject(type, tier, subject, document.getElementById(containerId));
    UT._current = { type, tier, subject };
  }

  function backToSubjects(type) {
    const listView = type === 'videos' ? 'ut-videos-subjects' : 'ut-notes-subjects';
    const itemsView = type === 'videos' ? 'ut-videos-items-view' : 'ut-notes-items-view';
    document.getElementById(itemsView).style.display = 'none';
    document.getElementById(listView).style.display = 'block';
  }

  function backToTierChooser(type) {
    activeTier[type] = null;
    UT.refreshCurrentView(type);
  }

  function refreshCurrentView(onlyType) {
    ['notes', 'videos'].forEach((type) => {
      if (onlyType && onlyType !== type) return;
      const chooserId = type === 'videos' ? 'ut-videos-chooser' : 'ut-notes-chooser';
      const listView = type === 'videos' ? 'ut-videos-subjects' : 'ut-notes-subjects';
      const chooserEl = document.getElementById(chooserId);
      const listEl = document.getElementById(listView);
      if (!chooserEl || !listEl) return;

      if (!activeTier[type]) {
        chooserEl.style.display = 'block';
        listEl.style.display = 'none';
        renderTierChooser(type, chooserEl);
      } else {
        chooserEl.style.display = 'none';
        listEl.style.display = 'block';
        renderSubjectsForTier(type, activeTier[type], listEl);
      }
    });
  }

  // ---------- در معرض window قرار دادن (برای onclick های HTML) ----------
  window.UT = {
    selectTier,
    openSubject,
    backToSubjects,
    backToTierChooser,
    addSubjectPrompt,
    deleteSubjectPrompt,
    refreshCurrentView,
    editVideo: (id) => window.editVideoAdmin && window.editVideoAdmin(id),
    _current: null,
    // اجرای یک‌بارِ دستی برای جزوات/ویدیوهای قدیمی که فیلد tier ندارن (از کنسول مرورگر، فقط ادمین)
    // مثال استفاده: UT.migrateLegacyTier('university')
    migrateLegacyTier: async function (tier) {
      if (!currentUser || !currentUser.isAdmin) return console.warn('فقط ادمین');
      let count = 0;
      for (const n of DATA.notes) {
        if (!n.tier) {
          await apiFs('update', 'notes', { docId: String(n.id), data: { tier } });
          n.tier = tier;
          count++;
        }
      }
      for (const v of DATA.videos) {
        if (!v.tier) {
          await apiFs('update', 'videos', { docId: String(v.id), data: { tier } });
          v.tier = tier;
          count++;
        }
      }
      console.log(`✅ ${count} مورد به دسته‌ی «${tier}» منتقل شد`);
      refreshCurrentView();
    },
  };

  // اجرای اول بعد از لود کامل صفحه
  document.addEventListener('DOMContentLoaded', () => refreshCurrentView());
  // اگه DOM از قبل لود شده (اسکریپت دیر لود شده)
  if (document.readyState !== 'loading') refreshCurrentView();
})();
