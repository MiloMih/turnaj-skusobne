import { db, categoriesCollectionRef, groupsCollectionRef, clubsCollectionRef, openModal, closeModal, populateCategorySelect, populateGroupSelect, query, where, getDocs, getDoc, setDoc, deleteDoc, updateDoc, writeBatch, doc, showMessage, showConfirmation } from './spravca-turnaja-common.js';

const addButton = document.getElementById('addButton');
const groupsContentDiv = document.getElementById('groupsContent');
const groupModal = document.getElementById('groupModal');
const groupModalCloseBtn = groupModal ? groupModal.querySelector('.group-modal-close') : null;
const groupForm = document.getElementById('groupForm');
const groupCategorySelect = document.getElementById('groupCategory');
const groupNameInput = document.getElementById('groupName');
const groupModalTitle = document.getElementById('groupModalTitle');
const groupFormSubmitButton = groupForm ? groupForm.querySelector('button[type="submit"]') : null;

let currentGroupModalMode = 'add';
let editingGroupId = null; // Bude uchovávať skutočné ID dokumentu skupiny pri úprave

/**
 * Otvorí modálne okno pre pridanie alebo úpravu skupiny.
 * @param {string|null} groupId - ID skupiny, ak sa upravuje existujúca skupina.
 * @param {object|null} groupData - Dáta skupiny, ak sa upravuje existujúca skupina.
 */
async function openGroupModal(groupId = null, groupData = null) {
    if (!groupModal || !groupForm || !groupCategorySelect || !groupNameInput || !groupModalTitle || !groupFormSubmitButton) {
        if (groupModal) closeModal(groupModal);
        return;
    }
    openModal(groupModal);
    groupForm.reset();
    groupNameInput.disabled = false;
    groupFormSubmitButton.textContent = 'Uložiť';

    if (groupId && groupData) {
        currentGroupModalMode = 'edit';
        editingGroupId = groupId; // Uložíme skutočné ID dokumentu
        groupModalTitle.textContent = 'Upraviť skupinu'; // Zmenený text pre úpravu
        groupFormSubmitButton.textContent = 'Uložiť zmeny';
        await populateCategorySelect(groupCategorySelect, groupData.categoryId);
        groupCategorySelect.disabled = false;
        groupNameInput.value = groupData.name || '';
        groupNameInput.focus();
    } else {
        currentGroupModalMode = 'add';
        editingGroupId = null;
        groupModalTitle.textContent = 'Pridať skupinu';
        groupFormSubmitButton.textContent = 'Uložiť';
        await populateCategorySelect(groupCategorySelect, null);
        groupCategorySelect.disabled = false;
        if (groupCategorySelect.options.length > 1) {
            groupCategorySelect.focus();
        } else {
            groupNameInput.focus();
        }
    }
}

/**
 * Zobrazí skupiny kategorizované podľa kategórií.
 */
async function displayGroupsByCategory() {
    if (!groupsContentDiv) return;
    groupsContentDiv.innerHTML = ''; // Vyčistí obsah pred načítaním
    try {
        const categoriesSnapshot = await getDocs(categoriesCollectionRef);
        // Zoradíme kategórie podľa poľa 'name' pre zobrazenie
        const sortedCategoriesDocs = categoriesSnapshot.docs.sort((a, b) => {
            const nameA = (a.data().name || '').toLowerCase();
            const nameB = (b.data().name || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });
        const categories = sortedCategoriesDocs.map(doc => ({ id: doc.id, data: doc.data() }));

        if (categories.length === 0) {
            const message = document.createElement('p');
            message.textContent = "Pridajte kategórie v sekcii 'Kategórie' pre zobrazenie skupín.";
            groupsContentDiv.appendChild(message);
            return;
        }

        const groupsSnapshot = await getDocs(groupsCollectionRef);
        const groupsByCategory = {};
        groupsSnapshot.forEach(doc => {
            const groupData = doc.data();
            const groupId = doc.id;
            const categoryId = groupData.categoryId;
            if (categoryId) {
                if (!groupsByCategory[categoryId]) {
                    groupsByCategory[categoryId] = [];
                }
                groupsByCategory[categoryId].push({ id: groupId, data: groupData });
            }
        });

        categories.forEach(category => {
            const categoryDisplayName = category.data.name || category.id; // Používame názov kategórie z dát, s fallbackom na ID
            const categoryId = category.id; // ID kategórie pre filtrovanie skupín
            const groupsForThisCategory = groupsByCategory[categoryId] || [];

            const categorySectionDiv = document.createElement('div');
            categorySectionDiv.classList.add('category-group-section', 'section-block');

            const categoryHeading = document.createElement('h2');
            categoryHeading.textContent = categoryDisplayName; // Zobrazujeme názov kategórie
            categorySectionDiv.appendChild(categoryHeading);

            const categoryGroupsTable = document.createElement('table');
            categoryGroupsTable.classList.add('category-group-table');

            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            const groupNameTh = document.createElement('th');
            groupNameTh.textContent = 'Názov skupiny';
            const actionsTh = document.createElement('th');
            actionsTh.textContent = '';
            headerRow.appendChild(groupNameTh);
            headerRow.appendChild(actionsTh);
            thead.appendChild(headerRow);
            categoryGroupsTable.appendChild(thead);

            const tbody = document.createElement('tbody');
            if (groupsForThisCategory.length === 0) {
                const noGroupsRow = document.createElement('tr');
                const td = document.createElement('td');
                td.colSpan = 2;
                td.textContent = `V kategórii "${categoryDisplayName}" zatiaľ nie sú žiadne skupiny.`; // Zobrazujeme názov kategórie
                td.style.textAlign = 'center';
                noGroupsRow.appendChild(td);
                tbody.appendChild(noGroupsRow);
            } else {
                groupsForThisCategory.sort((a, b) => (a.data.name || '').localeCompare(b.data.name || '', 'sk-SK'));
                groupsForThisCategory.forEach(group => {
                    const groupRow = document.createElement('tr');
                    const groupNameTd = document.createElement('td');
                    groupNameTd.textContent = group.data.name || 'Neznámy názov skupiny';
                    groupRow.appendChild(groupNameTd);

                    const groupActionsTd = document.createElement('td');
                    groupActionsTd.style.whiteSpace = 'nowrap';

                    const editGroupButton = document.createElement('button');
                    editGroupButton.textContent = 'Upraviť'; // Zmenený text pre úpravu
                    editGroupButton.classList.add('action-button');
                    editGroupButton.onclick = () => {
                        openGroupModal(group.id, group.data);
                    };
                    groupActionsTd.appendChild(editGroupButton);

                    const deleteGroupButton = document.createElement('button');
                    deleteGroupButton.textContent = 'Vymazať';
                    deleteGroupButton.classList.add('action-button', 'delete-button');
                    deleteGroupButton.onclick = async () => {
                        const confirmed = await showConfirmation('Potvrdenie vymazania', `Naozaj chcete vymazať skupinu "${group.data.name}" z kategórie "${categoryDisplayName}"? Tímy priradené k tejto skupine prídu o priradenie (groupId a orderInGroup sa nastavia na null)!`);
                        if (!confirmed) {
                            return;
                        }
                        try {
                            const batch = writeBatch(db);
                            const clubsInGroupQuery = query(clubsCollectionRef, where('groupId', '==', group.id));
                            const clubsSnapshot = await getDocs(clubsInGroupQuery);
                            clubsSnapshot.forEach(doc => {
                                batch.update(doc.ref, { groupId: null, orderInGroup: null });
                            });
                            batch.delete(doc(groupsCollectionRef, group.id));
                            await batch.commit();
                            await showMessage('Úspech', `Skupina "${group.data.name}" úspešne vymazaná.`);
                            displayGroupsByCategory();
                        } catch (error) {
                            console.error('Chyba pri mazaní skupiny:', error);
                            await showMessage('Chyba', 'Chyba pri mazaní skupiny! Prosím, skúste znova.');
                        }
                    };
                    groupActionsTd.appendChild(deleteGroupButton);
                    groupRow.appendChild(groupActionsTd);
                    tbody.appendChild(groupRow);
                });
            }
            categoryGroupsTable.appendChild(tbody);
            categorySectionDiv.appendChild(categoryGroupsTable);
            groupsContentDiv.appendChild(categorySectionDiv);
        });

        if (Object.keys(groupsByCategory).length === 0 && categories.length > 0) {
            const message = document.createElement('p');
            message.textContent = "Žiadne skupiny zatiaľ nemajú priradenú kategóriu, alebo žiadne skupiny neboli pridané.";
            groupsContentDiv.appendChild(message);
        }
    } catch (error) {
        console.error('Chyba pri načítaní dát skupín:', error);
        const errorMessage = document.createElement('p');
        errorMessage.textContent = 'Chyba pri načítaní dát skupín.';
        groupsContentDiv.appendChild(errorMessage);
    }
}

/**
 * Resetuje stav modálneho okna skupiny.
 */
function resetGroupModal() {
    currentGroupModalMode = 'add';
    editingGroupId = null;
    if (groupForm) groupForm.reset();
    if (groupModalTitle) groupModalTitle.textContent = 'Pridať skupinu';
    if (groupCategorySelect) {
        groupCategorySelect.innerHTML = '<option value="">-- Vyberte kategóriu --</option>';
        groupCategorySelect.disabled = true;
    }
}

// Spustí sa po načítaní DOM obsahu
document.addEventListener('DOMContentLoaded', async () => {
    const loggedInUsername = localStorage.getItem('username');
    if (!loggedInUsername || loggedInUsername !== 'admin') {
        window.location.href = 'login.html'; // Presmerovanie na prihlasovaciu stránku, ak nie je admin
        return;
    }
    displayGroupsByCategory();

    if (groupsContentDiv) {
        groupsContentDiv.style.display = 'flex';
        const otherSections = document.querySelectorAll('main > section, main > div');
        otherSections.forEach(section => {
            if (section.id !== 'groupsContent') {
                section.style.display = 'none';
            }
        });
    }

    if (addButton) {
        addButton.style.display = 'block';
        addButton.title = "Pridať skupinu";
        addButton.onclick = () => {
            openGroupModal();
        };
    }
});

// Listener pre zatvorenie modálneho okna
if (groupModalCloseBtn) {
    groupModalCloseBtn.addEventListener('click', () => {
        closeModal(groupModal);
        resetGroupModal();
    });
}

// Listener pre odoslanie formulára skupiny
if (groupForm) {
    groupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const selectedCategoryId = groupCategorySelect ? groupCategorySelect.value : '';
        const groupName = groupNameInput ? groupNameInput.value.trim() : '';

        if (selectedCategoryId === '' || selectedCategoryId.startsWith('--')) {
            await showMessage('Chyba', 'Prosím, vyberte platnú kategóriu pre skupinu.');
            if (groupCategorySelect) groupCategorySelect.focus();
            return;
        }
        if (groupName === '') {
            await showMessage('Chyba', 'Názov skupiny nemôže byť prázdny.');
            if (groupNameInput) groupNameInput.focus();
            return;
        }

        // Získame názov kategórie pre zobrazenie v správach
        const categoryDoc = await getDoc(doc(categoriesCollectionRef, selectedCategoryId));
        const categoryDisplayName = categoryDoc.exists() ? categoryDoc.data().name : selectedCategoryId;

        try {
            if (currentGroupModalMode === 'add') {
                // Režim pridávania novej skupiny
                // Skontrolujeme, či skupina s rovnakým názvom už v danej kategórii existuje
                const qExistingName = query(groupsCollectionRef, where('name', '==', groupName), where('categoryId', '==', selectedCategoryId));
                const existingNameSnapshot = await getDocs(qExistingName);
                if (!existingNameSnapshot.empty) {
                    await showMessage('Upozornenie', `Skupina s názvom "${groupName}" už v kategórii "${categoryDisplayName}" existuje! Názvy skupín musia byť unikátne v rámci kategórie.`);
                    if (groupNameInput) groupNameInput.focus();
                    return;
                }

                // Generujeme náhodné ID pre nový dokument skupiny
                const newGroupDocRef = doc(groupsCollectionRef);
                await setDoc(newGroupDocRef, { name: groupName, categoryId: selectedCategoryId });

                await showMessage('Úspech', `Skupina "${groupName}" v kategórii "${categoryDisplayName}" úspešne pridaná.`);
            } else if (currentGroupModalMode === 'edit') {
                // Režim úpravy existujúcej skupiny
                const groupIdToUpdate = editingGroupId; // Toto je stabilné ID dokumentu skupiny
                if (!groupIdToUpdate) {
                    await showMessage('Chyba', "Chyba pri úprave skupiny. Prosím, obnovte stránku.");
                    if (groupModal) closeModal(groupModal);
                    resetGroupModal();
                    return;
                }

                const currentGroupDoc = await getDoc(doc(groupsCollectionRef, groupIdToUpdate));
                if (!currentGroupDoc.exists()) {
                    await showMessage('Chyba', "Skupina na úpravu nebola nájdená.");
                    if (groupModal) closeModal(groupModal);
                    resetGroupModal();
                    return;
                }
                const oldGroupData = currentGroupDoc.data();
                const oldCategoryOfGroup = oldGroupData.categoryId;
                const oldNameOfGroup = oldGroupData.name;

                // Skontrolujeme, či sa zmenil názov alebo kategória
                const nameChanged = (groupName !== oldNameOfGroup);
                const categoryChanged = (selectedCategoryId !== oldCategoryOfGroup);

                if (nameChanged || categoryChanged) {
                    // Ak sa zmenil názov alebo kategória, skontrolujeme unikátnosť nového kombina
                    const qExistingName = query(groupsCollectionRef, where('name', '==', groupName), where('categoryId', '==', selectedCategoryId));
                    const existingNameSnapshot = await getDocs(qExistingName);

                    // Ak existuje iný dokument s rovnakým názvom a kategóriou
                    if (!existingNameSnapshot.empty && existingNameSnapshot.docs.some(doc => doc.id !== groupIdToUpdate)) {
                        await showMessage('Upozornenie', `Skupina s názvom "${groupName}" už v kategórii "${categoryDisplayName}" existuje! Názvy skupín musia byť unikátne v rámci kategórie.`);
                        if (groupNameInput) groupNameInput.focus();
                        return;
                    }

                    const batch = writeBatch(db);
                    // Aktualizujeme pole 'name' a 'categoryId' v existujúcom dokumente skupiny
                    batch.update(doc(groupsCollectionRef, groupIdToUpdate), { name: groupName, categoryId: selectedCategoryId });

                    // Ak sa zmenila kategória skupiny, aktualizujeme aj categoryId v kluboch priradených k tejto skupine
                    if (categoryChanged) {
                        const clubsInGroupQuery = query(clubsCollectionRef, where('groupId', '==', groupIdToUpdate));
                        const clubsSnapshot = await getDocs(clubsInGroupQuery);
                        clubsSnapshot.forEach(clubDoc => {
                            batch.update(clubDoc.ref, { categoryId: selectedCategoryId });
                        });
                    }
                    await batch.commit();
                    await showMessage('Úspech', `Skupina "${oldNameOfGroup}" úspešne upravená na "${groupName}" v kategórii "${categoryDisplayName}".`);
                } else {
                    // Ak sa nič nezmenilo, len zatvoríme modál
                    await showMessage('Informácia', 'Žiadne zmeny neboli vykonané.');
                }
            }
            if (groupModal) closeModal(groupModal);
            resetGroupModal();
            displayGroupsByCategory();
        } catch (error) {
            console.error('Chyba pri ukladaní skupiny:', error);
            await showMessage('Chyba', `Chyba pri ukladaní skupiny! Detail: ${error.message}`);
            if (groupModal) closeModal(groupModal);
            resetGroupModal();
        }
    });
}
