import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';

// Firebase configuration variables (provided by the environment)
const firebaseConfig = {
  apiKey: process.env.apiKey,
  authDomain: process.env.authDomain,
  projectId: process.env.projectId,
  storageBucket: process.env.storageBucket,
  messagingSenderId: process.env.messagingSenderId,
  appId: process.env.appId
};
const appId = process.env.appId; // Correction ici aussi
const initialAuthToken = null;


function App() {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    const [clientName, setClientName] = useState('');
    const [clientAddress, setClientAddress] = useState('');
    const [clientEmail, setClientEmail] = useState('');
    const [quoteNumber, setQuoteNumber] = useState('');
    const [quoteDate, setQuoteDate] = useState(new Date().toISOString().split('T')[0]);
    const [lineItems, setLineItems] = useState([{ description: '', quantity: 1, purchasePrice: 0, margin: 0, unitPrice: 0 }]);
    const [taxRate, setTaxRate] = useState(20); // Default 20% tax rate
    const [quotes, setQuotes] = useState([]);
    const [products, setProducts] = useState([]); // New state for products
    const [currentView, setCurrentView] = useState('create'); // 'create', 'list', 'view', 'products'
    const [selectedQuote, setSelectedQuote] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [modalMessage, setModalMessage] = useState('');

    // State for product management form
    const [productName, setProductName] = useState('');
    const [productDescription, setProductDescription] = useState('');
    const [productPurchasePrice, setProductPurchasePrice] = useState(0);
    const [productDefaultMargin, setProductDefaultMargin] = useState(0);
    const [editingProductId, setEditingProductId] = useState(null);

    // Initialize Firebase and set up auth listener
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const firebaseAuth = getAuth(app);
            setDb(firestore);
            setAuth(firebaseAuth);

            const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    if (!initialAuthToken) {
                        await signInAnonymously(firebaseAuth);
                    }
                }
                setIsAuthReady(true);
            });

            return () => unsubscribe();
        } catch (error) {
            console.error("Erreur lors de l'initialisation de Firebase:", error);
            showUserMessage("Erreur lors de l'initialisation de Firebase.");
        }
    }, []);

    // Sign in with custom token if available
    useEffect(() => {
        if (auth && initialAuthToken && !userId) {
            const signIn = async () => {
                try {
                    await signInWithCustomToken(auth, initialAuthToken);
                } catch (error) {
                    console.error("Erreur lors de la connexion avec le jeton personnalisé:", error);
                    showUserMessage("Erreur lors de la connexion. Veuillez réessayer.");
                    await signInAnonymously(auth);
                }
            };
            signIn();
        }
    }, [auth, userId]);

    // Fetch quotes when auth is ready and userId is available
    useEffect(() => {
        if (db && userId && isAuthReady) {
            const quotesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/quotes`);
            const unsubscribe = onSnapshot(quotesCollectionRef, (snapshot) => {
                const fetchedQuotes = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setQuotes(fetchedQuotes);
            }, (error) => {
                console.error("Erreur lors du chargement des devis:", error);
                showUserMessage("Erreur lors du chargement des devis.");
            });

            return () => unsubscribe();
        }
    }, [db, userId, isAuthReady]);

    // Fetch products when auth is ready and userId is available
    useEffect(() => {
        if (db && userId && isAuthReady) {
            const productsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/products`);
            const unsubscribe = onSnapshot(productsCollectionRef, (snapshot) => {
                const fetchedProducts = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setProducts(fetchedProducts);
            }, (error) => {
                console.error("Erreur lors du chargement des produits:", error);
                showUserMessage("Erreur lors du chargement des produits.");
            });
            return () => unsubscribe();
        }
    }, [db, userId, isAuthReady]);

    // Function to display user messages in a modal
    const showUserMessage = (message) => {
        setModalMessage(message);
        setShowModal(true);
    };

    const handleAddItem = () => {
        setLineItems([...lineItems, { description: '', quantity: 1, purchasePrice: 0, margin: 0, unitPrice: 0 }]);
    };

    const handleRemoveItem = (index) => {
        const newLineItems = lineItems.filter((_, i) => i !== index);
        setLineItems(newLineItems);
    };

    const handleItemChange = (index, field, value) => {
        const newLineItems = [...lineItems];
        let parsedValue = value;

        // For numeric fields, ensure the value is a valid number or 0
        if (['quantity', 'purchasePrice', 'margin'].includes(field)) {
            parsedValue = parseFloat(value);
            if (isNaN(parsedValue)) {
                parsedValue = 0; // Default to 0 if NaN
            }
        }

        newLineItems[index][field] = parsedValue;

        // Recalculate unitPrice if purchasePrice or margin changes
        if (field === 'purchasePrice' || field === 'margin' || field === 'quantity') {
            const purchasePrice = parseFloat(newLineItems[index].purchasePrice);
            const margin = parseFloat(newLineItems[index].margin);
            newLineItems[index].unitPrice = (isNaN(purchasePrice) ? 0 : purchasePrice) * (1 + (isNaN(margin) ? 0 : margin) / 100);
        }
        setLineItems(newLineItems);
    };

    const handleProductSelect = (index, productId) => {
        const newLineItems = [...lineItems];
        if (productId === "") {
            // Clear fields if "Sélectionner un produit" is chosen
            newLineItems[index] = { description: '', quantity: 1, purchasePrice: 0, margin: 0, unitPrice: 0 };
        } else {
            const selectedProduct = products.find(p => p.id === productId);
            if (selectedProduct) {
                newLineItems[index].description = selectedProduct.description;
                newLineItems[index].purchasePrice = selectedProduct.purchasePrice;
                newLineItems[index].margin = selectedProduct.defaultMargin;
                // Recalculate unitPrice based on selected product's data
                newLineItems[index].unitPrice = selectedProduct.purchasePrice * (1 + selectedProduct.defaultMargin / 100);
            }
        }
        setLineItems(newLineItems);
    };

    const calculateItemTotal = (item) => {
        return (item.quantity * item.unitPrice).toFixed(2);
    };

    const calculateSubtotal = () => {
        return lineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0).toFixed(2);
    };

    const calculateTax = () => {
        return (parseFloat(calculateSubtotal()) * (taxRate / 100)).toFixed(2);
    };

    const calculateGrandTotal = () => {
        return (parseFloat(calculateSubtotal()) + parseFloat(calculateTax())).toFixed(2);
    };

    const generateQuoteNumber = () => {
        const now = new Date();
        const year = now.getFullYear().toString().slice(-2);
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const day = now.getDate().toString().padStart(2, '0');
        const hour = now.getHours().toString().padStart(2, '0');
        const minute = now.getMinutes().toString().padStart(2, '0');
        const second = now.getSeconds().toString().padStart(2, '0');
        return `DEV-${year}${month}${day}-${hour}${minute}${second}`;
    };

    const handleSaveQuote = async () => {
        if (!db || !userId) {
            showUserMessage("Base de données non initialisée ou utilisateur non connecté.");
            return;
        }

        if (!clientName || !quoteNumber || lineItems.length === 0 || lineItems.some(item => !item.description)) {
            showUserMessage("Veuillez remplir toutes les informations requises (Nom du client, Numéro de devis, et au moins une ligne d'article avec description).");
            return;
        }

        const newQuote = {
            clientName,
            clientAddress,
            clientEmail,
            quoteNumber: quoteNumber || generateQuoteNumber(),
            quoteDate,
            lineItems: lineItems.map(item => ({
                description: item.description,
                quantity: parseFloat(item.quantity),
                purchasePrice: parseFloat(item.purchasePrice),
                margin: parseFloat(item.margin),
                unitPrice: parseFloat(item.unitPrice)
            })),
            taxRate: parseFloat(taxRate),
            subtotal: parseFloat(calculateSubtotal()),
            tax: parseFloat(calculateTax()),
            grandTotal: parseFloat(calculateGrandTotal()),
            createdAt: new Date().toISOString()
        };

        try {
            const quotesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/quotes`);
            await addDoc(quotesCollectionRef, newQuote);
            showUserMessage("Devis sauvegardé avec succès !");
            // Clear form
            setClientName('');
            setClientAddress('');
            setClientEmail('');
            setQuoteNumber('');
            setQuoteDate(new Date().toISOString().split('T')[0]);
            setLineItems([{ description: '', quantity: 1, purchasePrice: 0, margin: 0, unitPrice: 0 }]);
            setTaxRate(20);
            setCurrentView('list');
        } catch (e) {
            console.error("Erreur lors de l'ajout du document: ", e);
            showUserMessage("Erreur lors de la sauvegarde du devis.");
        }
    };

    const handleViewQuote = (quote) => {
        setSelectedQuote(quote);
        setCurrentView('view');
    };

    const handleDeleteQuote = async (quoteId) => {
        if (!db || !userId) {
            showUserMessage("Base de données non initialisée ou utilisateur non connecté.");
            return;
        }
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/quotes`, quoteId));
            showUserMessage("Devis supprimé avec succès !");
        } catch (e) {
            console.error("Erreur lors de la suppression du document: ", e);
            showUserMessage("Erreur lors de la suppression du devis.");
        }
    };

    const handleEditQuote = (quote) => {
        setClientName(quote.clientName);
        setClientAddress(quote.clientAddress);
        setClientEmail(quote.clientEmail);
        setQuoteNumber(quote.quoteNumber);
        setQuoteDate(quote.quoteDate);
        setLineItems(quote.lineItems.map(item => ({
            ...item,
            purchasePrice: item.purchasePrice || 0,
            margin: item.margin || 0,
            unitPrice: item.unitPrice || (item.purchasePrice * (1 + item.margin / 100)) || 0
        })));
        setTaxRate(quote.taxRate);
        setSelectedQuote(quote);
        setCurrentView('create');
    };

    const handleUpdateQuote = async () => {
        if (!db || !userId || !selectedQuote) {
            showUserMessage("Base de données non initialisée, utilisateur non connecté ou devis non sélectionné.");
            return;
        }

        if (!clientName || !quoteNumber || lineItems.length === 0 || lineItems.some(item => !item.description)) {
            showUserMessage("Veuillez remplir toutes les informations requises (Nom du client, Numéro de devis, et au moins une ligne d'article avec description).");
            return;
        }

        const updatedQuoteData = {
            clientName,
            clientAddress,
            clientEmail,
            quoteNumber: quoteNumber,
            quoteDate,
            lineItems: lineItems.map(item => ({
                description: item.description,
                quantity: parseFloat(item.quantity),
                purchasePrice: parseFloat(item.purchasePrice),
                margin: parseFloat(item.margin),
                unitPrice: parseFloat(item.unitPrice)
            })),
            taxRate: parseFloat(taxRate),
            subtotal: parseFloat(calculateSubtotal()),
            tax: parseFloat(calculateTax()),
            grandTotal: parseFloat(calculateGrandTotal()),
            updatedAt: new Date().toISOString()
        };

        try {
            await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/quotes`, selectedQuote.id), updatedQuoteData);
            showUserMessage("Devis mis à jour avec succès !");
            setClientName('');
            setClientAddress('');
            setClientEmail('');
            setQuoteNumber('');
            setQuoteDate(new Date().toISOString().split('T')[0]);
            setLineItems([{ description: '', quantity: 1, purchasePrice: 0, margin: 0, unitPrice: 0 }]);
            setTaxRate(20);
            setSelectedQuote(null);
            setCurrentView('list');
        } catch (e) {
            console.error("Erreur lors de la mise à jour du document: ", e);
            showUserMessage("Erreur lors de la mise à jour du devis.");
        }
    };

    const handleNewQuote = () => {
        setClientName('');
        setClientAddress('');
        setClientEmail('');
        setQuoteNumber('');
        setQuoteDate(new Date().toISOString().split('T')[0]);
        setLineItems([{ description: '', quantity: 1, purchasePrice: 0, margin: 0, unitPrice: 0 }]);
        setTaxRate(20);
        setSelectedQuote(null);
        setCurrentView('create');
    };

    // Product Management Functions
    const handleAddOrUpdateProduct = async () => {
        if (!db || !userId) {
            showUserMessage("Base de données non initialisée ou utilisateur non connecté.");
            return;
        }
        if (!productName || !productDescription) {
            showUserMessage("Veuillez remplir le nom et la description du produit.");
            return;
        }

        const productData = {
            name: productName,
            description: productDescription,
            purchasePrice: parseFloat(productPurchasePrice),
            defaultMargin: parseFloat(productDefaultMargin)
        };

        try {
            const productsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/products`);
            if (editingProductId) {
                await updateDoc(doc(productsCollectionRef, editingProductId), productData);
                showUserMessage("Produit mis à jour avec succès !");
            } else {
                await addDoc(productsCollectionRef, productData);
                showUserMessage("Produit ajouté avec succès !");
            }
            // Clear form
            setProductName('');
            setProductDescription('');
            setProductPurchasePrice(0);
            setProductDefaultMargin(0);
            setEditingProductId(null);
        } catch (e) {
            console.error("Erreur lors de l'ajout/mise à jour du produit: ", e);
            showUserMessage("Erreur lors de l'ajout/mise à jour du produit.");
        }
    };

    const handleEditProduct = (product) => {
        setProductName(product.name);
        setProductDescription(product.description);
        setProductPurchasePrice(product.purchasePrice);
        setProductDefaultMargin(product.defaultMargin);
        setEditingProductId(product.id);
        setCurrentView('products'); // Ensure we are on the products view
    };

    const handleDeleteProduct = async (productId) => {
        if (!db || !userId) {
            showUserMessage("Base de données non initialisée ou utilisateur non connecté.");
            return;
        }
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/products`, productId));
            showUserMessage("Produit supprimé avec succès !");
        } catch (e) {
            console.error("Erreur lors de la suppression du produit: ", e);
            showUserMessage("Erreur lors de la suppression du produit.");
        }
    };

    // Function to handle PDF generation/print
    const handleGeneratePdf = async () => {
        if (!selectedQuote) {
            showUserMessage("Veuillez sélectionner un devis à imprimer.");
            return;
        }

        // Dynamically load html2canvas and jspdf
        // This ensures they are loaded only when needed and avoids server-side import issues.
        if (typeof window.html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
            showUserMessage("Chargement des bibliothèques de PDF... Veuillez réessayer dans un instant.");
            const script1 = document.createElement('script');
            script1.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            script1.onload = () => {
                const script2 = document.createElement('script');
                script2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                script2.onload = () => showUserMessage("Bibliothèques PDF chargées. Veuillez cliquer à nouveau sur 'Générer PDF'.");
                document.body.appendChild(script2);
            };
            document.body.appendChild(script1);
            return;
        }

        // We will directly capture the content of the 'view' section
        const input = document.getElementById('quote-details-view'); // Assuming an ID for the view section

        if (!input) {
            showUserMessage("Impossible de trouver le contenu du devis à imprimer. Assurez-vous d'être sur la vue 'Détails du Devis'.");
            return;
        }

        try {
            const canvas = await window.html2canvas(input, { scale: 2 }); // Scale for better resolution
            const imgData = canvas.toDataURL('image/png');
            const pdf = new window.jspdf.jsPDF('p', 'mm', 'a4'); // Portrait, millimeters, A4 size
            const imgWidth = 210; // A4 width in mm
            const pageHeight = 297; // A4 height in mm
            const imgHeight = canvas.height * imgWidth / canvas.width;
            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            pdf.save(`devis-${selectedQuote.quoteNumber}.pdf`);
            showUserMessage("PDF généré avec succès !");

        } catch (error) {
            console.error("Erreur lors de la génération du PDF:", error);
            showUserMessage("Erreur lors de la génération du PDF. Veuillez réessayer.");
        }
    };


    if (!isAuthReady) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <div className="text-xl font-semibold text-gray-700">Chargement de l'application...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 font-sans text-gray-800 p-4 sm:p-6">
            <div className="max-w-4xl mx-auto bg-white shadow-xl rounded-2xl p-6 sm:p-8">
                <h1 className="text-3xl sm:text-4xl font-extrabold text-center text-indigo-700 mb-8">
                    Application de Devis
                </h1>

                <div className="flex justify-center mb-6 space-x-4 flex-wrap gap-2">
                    <button
                        onClick={handleNewQuote}
                        className={`px-5 py-2 rounded-lg font-semibold transition-all duration-300 ${
                            currentView === 'create' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                        Créer un Devis
                    </button>
                    <button
                        onClick={() => setCurrentView('list')}
                        className={`px-5 py-2 rounded-lg font-semibold transition-all duration-300 ${
                            currentView === 'list' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                        Mes Devis
                    </button>
                    <button
                        onClick={() => setCurrentView('products')}
                        className={`px-5 py-2 rounded-lg font-semibold transition-all duration-300 ${
                            currentView === 'products' ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                    >
                        Gérer les Produits
                    </button>
                </div>

                {userId && (
                    <div className="text-sm text-gray-500 text-center mb-4">
                        Votre ID utilisateur: <span className="font-mono text-indigo-600 break-all">{userId}</span>
                    </div>
                )}

                {currentView === 'create' && (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-indigo-600 mb-4">
                            {selectedQuote ? 'Modifier le Devis' : 'Nouveau Devis'}
                        </h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-gray-50 p-4 rounded-lg shadow-sm">
                                <h3 className="text-lg font-semibold text-gray-700 mb-3">Informations Client</h3>
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        placeholder="Nom du Client"
                                        value={clientName}
                                        onChange={(e) => setClientName(e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                    <input
                                        type="text"
                                        placeholder="Adresse du Client"
                                        value={clientAddress}
                                        onChange={(e) => setClientAddress(e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                    <input
                                        type="email"
                                        placeholder="Email du Client"
                                        value={clientEmail}
                                        onChange={(e) => setClientEmail(e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                </div>
                            </div>

                            <div className="bg-gray-50 p-4 rounded-lg shadow-sm">
                                <h3 className="text-lg font-semibold text-gray-700 mb-3">Détails du Devis</h3>
                                <div className="space-y-3">
                                    <input
                                        type="text"
                                        placeholder="Numéro de Devis (auto-généré si vide)"
                                        value={quoteNumber}
                                        onChange={(e) => setQuoteNumber(e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                    <input
                                        type="date"
                                        value={quoteDate}
                                        onChange={(e) => setQuoteDate(e.target.value)}
                                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                    <div className="flex items-center space-x-2">
                                        <label htmlFor="taxRate" className="text-gray-600">Taux de TVA:</label>
                                        <input
                                            id="taxRate"
                                            type="number"
                                            value={taxRate}
                                            onChange={(e) => setTaxRate(parseFloat(e.target.value))}
                                            className="w-24 p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                        <span className="text-gray-600">%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-lg shadow-sm">
                            <h3 className="text-lg font-semibold text-gray-700 mb-3">Articles</h3>
                            <div className="space-y-4">
                                {lineItems.map((item, index) => (
                                    <div key={index} className="flex flex-col sm:flex-row items-center gap-3 p-3 border border-gray-200 rounded-md bg-white shadow-sm">
                                        <select
                                            value={item.productId || ''} // Assuming productId exists if selected
                                            onChange={(e) => handleProductSelect(index, e.target.value)}
                                            className="flex-grow w-full sm:w-auto p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                        >
                                            <option value="">Sélectionner un produit</option>
                                            {products.map(product => (
                                                <option key={product.id} value={product.id}>
                                                    {product.name}
                                                </option>
                                            ))}
                                        </select>
                                        <input
                                            type="text"
                                            placeholder="Description"
                                            value={item.description}
                                            onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                                            className="flex-grow w-full sm:w-auto p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                        <input
                                            type="number"
                                            placeholder="Prix Achat"
                                            value={item.purchasePrice}
                                            onChange={(e) => handleItemChange(index, 'purchasePrice', e.target.value)}
                                            className="w-28 p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                        <div className="flex items-center">
                                            <input
                                                type="number"
                                                placeholder="Marge %"
                                                value={item.margin}
                                                onChange={(e) => handleItemChange(index, 'margin', e.target.value)}
                                                className="w-24 p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                            <span className="ml-1">%</span>
                                        </div>
                                        <input
                                            type="number"
                                            placeholder="Qté"
                                            value={item.quantity}
                                            onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                            className="w-20 p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                        />
                                        <span className="font-medium text-gray-700 w-28 text-right">
                                            Prix Unitaire: {item.unitPrice.toFixed(2)} €
                                        </span>
                                        <span className="font-medium text-gray-700 w-24 text-right">
                                            Total: {calculateItemTotal(item)} €
                                        </span>
                                        <button
                                            onClick={() => handleRemoveItem(index)}
                                            className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors duration-200"
                                            aria-label="Supprimer l'article"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 01-2 0v6a1 1 0 112 0V8z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={handleAddItem}
                                className="mt-4 w-full sm:w-auto px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors duration-200 shadow-md"
                            >
                                Ajouter un article
                            </button>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-lg shadow-sm text-right space-y-2">
                            <div className="flex justify-between font-medium">
                                <span>Sous-total:</span>
                                <span>{calculateSubtotal()} €</span>
                            </div>
                            <div className="flex justify-between font-medium">
                                <span>TVA ({taxRate}%):</span>
                                <span>{calculateTax()} €</span>
                            </div>
                            <div className="flex justify-between text-xl font-bold text-indigo-700 border-t pt-2 mt-2">
                                <span>Total Général:</span>
                                <span>{calculateGrandTotal()} €</span>
                            </div>
                        </div>

                        <button
                            onClick={selectedQuote ? handleUpdateQuote : handleSaveQuote}
                            className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors duration-300 shadow-lg"
                        >
                            {selectedQuote ? 'Mettre à jour le Devis' : 'Sauvegarder le Devis'}
                        </button>
                    </div>
                )}

                {currentView === 'list' && (
                    <div className="space-y-4">
                        <h2 className="text-2xl font-bold text-indigo-600 mb-4">Mes Devis</h2>
                        {quotes.length === 0 ? (
                            <p className="text-center text-gray-500">Aucun devis sauvegardé pour le moment.</p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {quotes.map((quote) => (
                                    <div key={quote.id} className="bg-white border border-gray-200 rounded-lg shadow-md p-4 space-y-2">
                                        <h3 className="text-lg font-semibold text-indigo-700">{quote.clientName}</h3>
                                        <p className="text-sm text-gray-600">Devis N°: <span className="font-mono">{quote.quoteNumber}</span></p>
                                        <p className="text-sm text-gray-600">Date: {quote.quoteDate}</p>
                                        <p className="text-lg font-bold text-green-600">Total: {quote.grandTotal} €</p>
                                        <div className="flex flex-wrap gap-2 mt-3">
                                            <button
                                                onClick={() => handleViewQuote(quote)}
                                                className="px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 transition-colors"
                                            >
                                                Voir
                                            </button>
                                            <button
                                                onClick={() => handleEditQuote(quote)}
                                                className="px-3 py-1 bg-yellow-500 text-white text-sm rounded-md hover:bg-yellow-600 transition-colors"
                                            >
                                                Modifier
                                            </button>
                                            <button
                                                onClick={() => handleDeleteQuote(quote.id)}
                                                className="px-3 py-1 bg-red-500 text-white text-sm rounded-md hover:bg-red-600 transition-colors"
                                            >
                                                Supprimer
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {currentView === 'view' && selectedQuote && (
                    <div id="quote-details-view" className="space-y-6"> {/* Added ID for easy selection */}
                        <h2 className="text-2xl font-bold text-indigo-600 mb-4">Détails du Devis</h2>

                        <div className="bg-gray-50 p-4 rounded-lg shadow-sm">
                            <h3 className="text-lg font-semibold text-gray-700 mb-3">Informations Client</h3>
                            <p><strong>Nom:</strong> {selectedQuote.clientName}</p>
                            <p><strong>Adresse:</strong> {selectedQuote.clientAddress}</p>
                            <p><strong>Email:</strong> {selectedQuote.clientEmail}</p>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-lg shadow-sm">
                            <h3 className="text-lg font-semibold text-gray-700 mb-3">Détails du Devis</h3>
                            <p><strong>Numéro de Devis:</strong> {selectedQuote.quoteNumber}</p>
                            <p><strong>Date:</strong> {selectedQuote.quoteDate}</p>
                            <p><strong>Taux de TVA:</strong> {selectedQuote.taxRate}%</p>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-lg shadow-sm">
                            <h3 className="text-lg font-semibold text-gray-700 mb-3">Articles</h3>
                            <table className="min-w-full bg-white rounded-lg overflow-hidden shadow-sm">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="py-2 px-4 text-left text-sm font-semibold text-gray-600">Description</th>
                                        <th className="py-2 px-4 text-left text-sm font-semibold text-gray-600">Qté</th>
                                        <th className="py-2 px-4 text-left text-sm font-semibold text-gray-600">Prix Achat</th>
                                        <th className="py-2 px-4 text-left text-sm font-semibold text-gray-600">Marge (%)</th>
                                        <th className="py-2 px-4 text-left text-sm font-semibold text-gray-600">Prix Unitaire</th>
                                        <th className="py-2 px-4 text-left text-sm font-semibold text-gray-600">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedQuote.lineItems.map((item, index) => (
                                        <tr key={index} className="border-b border-gray-200 last:border-b-0">
                                            <td className="py-2 px-4 text-sm">{item.description}</td>
                                            <td className="py-2 px-4 text-sm">{item.quantity}</td>
                                            <td className="py-2 px-4 text-sm">{item.purchasePrice ? item.purchasePrice.toFixed(2) : '0.00'} €</td>
                                            <td className="py-2 px-4 text-sm">{item.margin ? item.margin.toFixed(2) : '0.00'} %</td>
                                            <td className="py-2 px-4 text-sm">{item.unitPrice.toFixed(2)} €</td>
                                            <td className="py-2 px-4 text-sm">{(item.quantity * item.unitPrice).toFixed(2)} €</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-lg shadow-sm text-right space-y-2">
                            <div className="flex justify-between font-medium">
                                <span>Sous-total:</span>
                                <span>{selectedQuote.subtotal.toFixed(2)} €</span>
                            </div>
                            <div className="flex justify-between font-medium">
                                <span>TVA ({selectedQuote.taxRate}%):</span>
                                <span>{selectedQuote.tax.toFixed(2)} €</span>
                            </div>
                            <div className="flex justify-between text-xl font-bold text-indigo-700 border-t pt-2 mt-2">
                                <span>Total Général:</span>
                                <span>{selectedQuote.grandTotal.toFixed(2)} €</span>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-4 mt-6">
                            <button
                                onClick={handleGeneratePdf}
                                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors duration-300 shadow-lg"
                            >
                                Générer PDF (Imprimer)
                            </button>
                        </div>
                        <button
                            onClick={() => setCurrentView('list')}
                            className="w-full py-3 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors duration-300 shadow-lg mt-4"
                        >
                            Retour à la liste
                        </button>
                    </div>
                )}

                {currentView === 'products' && (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-indigo-600 mb-4">Gérer les Produits</h2>

                        <div className="bg-gray-50 p-4 rounded-lg shadow-sm">
                            <h3 className="text-lg font-semibold text-gray-700 mb-3">
                                {editingProductId ? 'Modifier le Produit' : 'Ajouter un Nouveau Produit'}
                            </h3>
                            <div className="space-y-3">
                                <input
                                    type="text"
                                    placeholder="Nom du Produit"
                                    value={productName}
                                    onChange={(e) => setProductName(e.target.value)}
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                <textarea
                                    placeholder="Description du Produit"
                                    value={productDescription}
                                    onChange={(e) => setProductDescription(e.target.value)}
                                    rows="3"
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                ></textarea>
                                <input
                                    type="number"
                                    placeholder="Prix d'Achat"
                                    value={productPurchasePrice}
                                    onChange={(e) => setProductPurchasePrice(parseFloat(e.target.value) || 0)}
                                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="number"
                                        placeholder="Marge par Défaut (%)"
                                        value={productDefaultMargin}
                                        onChange={(e) => setProductDefaultMargin(parseFloat(e.target.value) || 0)}
                                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                    <span className="text-gray-600">%</span>
                                </div>
                                <button
                                    onClick={handleAddOrUpdateProduct}
                                    className="w-full py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors duration-300 shadow-md"
                                >
                                    {editingProductId ? 'Mettre à jour le Produit' : 'Ajouter le Produit'}
                                </button>
                                {editingProductId && (
                                    <button
                                        onClick={() => {
                                            setProductName('');
                                            setProductDescription('');
                                            setProductPurchasePrice(0);
                                            setProductDefaultMargin(0);
                                            setEditingProductId(null);
                                        }}
                                        className="w-full py-2 mt-2 bg-gray-400 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors duration-300 shadow-md"
                                    >
                                        Annuler la modification
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-lg shadow-sm">
                            <h3 className="text-lg font-semibold text-gray-700 mb-3">Liste des Produits</h3>
                            {products.length === 0 ? (
                                <p className="text-center text-gray-500">Aucun produit enregistré pour le moment.</p>
                            ) : (
                                <div className="space-y-3">
                                    {products.map((product) => (
                                        <div key={product.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border border-gray-200 rounded-md bg-white shadow-sm">
                                            <div>
                                                <p className="font-semibold text-indigo-700">{product.name}</p>
                                                <p className="text-sm text-gray-600">{product.description}</p>
                                                <p className="text-sm text-gray-600">Prix Achat: {product.purchasePrice.toFixed(2)} € | Marge: {product.defaultMargin.toFixed(2)} %</p>
                                            </div>
                                            <div className="flex flex-wrap gap-2 mt-2 sm:mt-0">
                                                <button
                                                    onClick={() => handleEditProduct(product)}
                                                    className="px-3 py-1 bg-yellow-500 text-white text-sm rounded-md hover:bg-yellow-600 transition-colors"
                                                >
                                                    Modifier
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteProduct(product.id)}
                                                    className="px-3 py-1 bg-red-500 text-white text-sm rounded-md hover:bg-red-600 transition-colors"
                                                >
                                                    Supprimer
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Custom Modal for messages */}
            {showModal && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-auto text-center">
                        <p className="text-lg font-semibold text-gray-800 mb-4">{modalMessage}</p>
                        <button
                            onClick={() => setShowModal(false)}
                            className="px-5 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors duration-200"
                        >
                            OK
                        </button>
                    </div> 
                </div>  
            )}
        </div>
    ); 
}

export default App;