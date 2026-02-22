---
title: Part 14 - 内部ノードの分割
date: 2023-05-23
---

> 🎯 **このパートを学ぶ理由**: B-Tree実装の最終段階。内部ノードも分割できるようになり、任意の数のデータを格納できる完全なB-Treeが完成する。
> **前提知識**: Part 10-13（ノード分割 + 親ノード更新）

旅の次の区間は、新しいキーを収容できない内部ノードの分割だ。以下の例を考えてみよう：

{% include image.html url="assets/images/splitting-internal-node.png" description="内部ノード分割の例" %}

この例では、キー「11」をツリーに追加する。これによりルートが分割される。内部ノードを分割する際には、すべてを整合させるためにいくつかのことを行う必要がある：

1. 元のノードの(n-1)/2個のキーを格納する兄弟ノードを作成する
2. これらのキーを元のノードから兄弟ノードに移す
3. 分割後の新しい最大キーを反映するよう、親内の元のノードのキーを更新する
4. 兄弟ノードを親に挿入する（これにより親も分割される可能性がある）

まず、スタブコードを`internal_node_split_and_insert`の呼び出しに置き換える

```diff
+void internal_node_split_and_insert(Table* table, uint32_t parent_page_num,
+                          uint32_t child_page_num);
+
 void internal_node_insert(Table* table, uint32_t parent_page_num,
                           uint32_t child_page_num) {
   /*
@@ -685,25 +714,39 @@ void internal_node_insert(Table* table, uint32_t parent_page_num,

   void* parent = get_page(table->pager, parent_page_num);
   void* child = get_page(table->pager, child_page_num);
-  uint32_t child_max_key = get_node_max_key(child);
+  uint32_t child_max_key = get_node_max_key(table->pager, child);
   uint32_t index = internal_node_find_child(parent, child_max_key);

   uint32_t original_num_keys = *internal_node_num_keys(parent);
-  *internal_node_num_keys(parent) = original_num_keys + 1;

   if (original_num_keys >= INTERNAL_NODE_MAX_CELLS) {
-    printf("Need to implement splitting internal node\n");
-    exit(EXIT_FAILURE);
+    internal_node_split_and_insert(table, parent_page_num, child_page_num);
+    return;
   }

   uint32_t right_child_page_num = *internal_node_right_child(parent);
+  /*
+  右の子がINVALID_PAGE_NUMの内部ノードは空である
+  */
+  if (right_child_page_num == INVALID_PAGE_NUM) {
+    *internal_node_right_child(parent) = child_page_num;
+    return;
+  }
+
   void* right_child = get_page(table->pager, right_child_page_num);
+  /*
+  ノードの最大セル数に既に達している場合、分割前にインクリメントしてはいけない。
+  新しいキー/子ペアを挿入せずにインクリメントしてすぐに
+  internal_node_split_and_insertを呼ぶと、
+  (max_cells + 1)の位置に未初期化の値でキーが作成されてしまう
+  */
+  *internal_node_num_keys(parent) = original_num_keys + 1;

-  if (child_max_key > get_node_max_key(right_child)) {
+  if (child_max_key > get_node_max_key(table->pager, right_child)) {
     /* 右の子を置き換え */
     *internal_node_child(parent, original_num_keys) = right_child_page_num;
     *internal_node_key(parent, original_num_keys) =
-        get_node_max_key(right_child);
+        get_node_max_key(table->pager, right_child);
     *internal_node_right_child(parent) = child_page_num;
```

ここではスタブの置き換え以外に3つの重要な変更を行っている：
 - まず、`internal_node_split_and_insert`を前方宣言する。定義内で`internal_node_insert`を呼ぶため、コードの重複を避けるためだ。
 - 次に、親のキー数をインクリメントするロジックを関数定義の後方に移動し、分割前にインクリメントされないようにする。
 - 最後に、空の内部ノードに挿入された子ノードは、他の操作なしにその内部ノードの右の子になるようにする。空の内部ノードには操作すべきキーがないためだ。

上記の変更では、空のノードを識別できる必要がある。そのために、すべての空ノードの子として使用される無効なページ番号を表す定数を定義する。

```diff
+#define INVALID_PAGE_NUM UINT32_MAX
```
内部ノードの初期化時に、右の子をこの無効なページ番号で初期化する。

```diff
@@ -330,6 +335,12 @@ void initialize_internal_node(void* node) {
   set_node_type(node, NODE_INTERNAL);
   set_node_root(node, false);
   *internal_node_num_keys(node) = 0;
+  /*
+  ルートページ番号が0であるため必要。内部ノードの初期化時に
+  右の子を無効なページ番号で明示的に初期化しないと、
+  実行時に値が0になる可能性があり、そのノードがルートの親になってしまう
+  */
+  *internal_node_right_child(node) = INVALID_PAGE_NUM;
 }
```

このステップは上のコメントが要約しようとしている問題のために必要になった。右の子フィールドを明示的に初期化せずに内部ノードを初期化すると、コンパイラやマシンのアーキテクチャによっては実行時にそのフィールドの値が0になる可能性がある。ルートページ番号として0を使っているため、新しく確保された内部ノードがルートの親になってしまう。

`internal_node_child`関数に、無効なページへのアクセスを検出するガードを追加した。

```diff
@@ -186,9 +188,19 @@ uint32_t* internal_node_child(void* node, uint32_t child_num) {
     printf("Tried to access child_num %d > num_keys %d\n", child_num, num_keys);
     exit(EXIT_FAILURE);
   } else if (child_num == num_keys) {
-    return internal_node_right_child(node);
+    uint32_t* right_child = internal_node_right_child(node);
+    if (*right_child == INVALID_PAGE_NUM) {
+      printf("Tried to access right child of node, but was invalid page\n");
+      exit(EXIT_FAILURE);
+    }
+    return right_child;
   } else {
-    return internal_node_cell(node, child_num);
+    uint32_t* child = internal_node_cell(node, child_num);
+    if (*child == INVALID_PAGE_NUM) {
+      printf("Tried to access child %d of node, but was invalid page\n", child_num);
+      exit(EXIT_FAILURE);
+    }
+    return child;
   }
 }
```

`print_tree`関数にも、空のノードを表示しようとしないためのガードが必要だ。空ノードの表示は無効なページへのアクセスを伴うためだ。

```diff
@@ -294,15 +305,17 @@ void print_tree(Pager* pager, uint32_t page_num, uint32_t indentation_level) {
       num_keys = *internal_node_num_keys(node);
       indent(indentation_level);
       printf("- internal (size %d)\n", num_keys);
-      for (uint32_t i = 0; i < num_keys; i++) {
-        child = *internal_node_child(node, i);
+      if (num_keys > 0) {
+        for (uint32_t i = 0; i < num_keys; i++) {
+          child = *internal_node_child(node, i);
+          print_tree(pager, child, indentation_level + 1);
+
+          indent(indentation_level + 1);
+          printf("- key %d\n", *internal_node_key(node, i));
+        }
+        child = *internal_node_right_child(node);
         print_tree(pager, child, indentation_level + 1);
-
-        indent(indentation_level + 1);
-        printf("- key %d\n", *internal_node_key(node, i));
       }
-      child = *internal_node_right_child(node);
-      print_tree(pager, child, indentation_level + 1);
       break;
   }
 }
```

いよいよ主役の`internal_node_split_and_insert`だ。まず全体を示し、その後ステップごとに分解する。

```diff
+void internal_node_split_and_insert(Table* table, uint32_t parent_page_num,
+                          uint32_t child_page_num) {
+  uint32_t old_page_num = parent_page_num;
+  void* old_node = get_page(table->pager,parent_page_num);
+  uint32_t old_max = get_node_max_key(table->pager, old_node);
+
+  void* child = get_page(table->pager, child_page_num);
+  uint32_t child_max = get_node_max_key(table->pager, child);
+
+  uint32_t new_page_num = get_unused_page_num(table->pager);
+
+  /*
+  ポインタを更新する前に、この操作がルートの分割を伴うかどうかを
+  記録するフラグを宣言する。ルートの分割の場合、新しく作成された
+  ノードはテーブルの新しいルートを作成するステップで挿入される。
+  ルートの分割でない場合は、旧ノードのキーが移された後に
+  新しく作成されたノードを親に挿入する必要がある。
+  新しく作成されたノードの親が新しく初期化されたルートノードでない場合は、
+  親に既存のキーが存在する可能性があるため、すぐには正しいインデックスに
+  挿入できない。まだキーを持っていないノードを挿入しようとしても
+  正しい位置には配置されない
+  */
+  uint32_t splitting_root = is_node_root(old_node);
+
+  void* parent;
+  void* new_node;
+  if (splitting_root) {
+    create_new_root(table, new_page_num);
+    parent = get_page(table->pager,table->root_page_num);
+    /*
+    ルートを分割する場合、old_nodeを新しいルートの左の子を指すよう
+    更新する必要がある。new_page_numは既に新しいルートの右の子を指している
+    */
+    old_page_num = *internal_node_child(parent,0);
+    old_node = get_page(table->pager, old_page_num);
+  } else {
+    parent = get_page(table->pager,*node_parent(old_node));
+    new_node = get_page(table->pager, new_page_num);
+    initialize_internal_node(new_node);
+  }
+
+  uint32_t* old_num_keys = internal_node_num_keys(old_node);
+
+  uint32_t cur_page_num = *internal_node_right_child(old_node);
+  void* cur = get_page(table->pager, cur_page_num);
+
+  /*
+  まず右の子を新ノードに入れ、旧ノードの右の子を無効なページ番号に設定する
+  */
+  internal_node_insert(table, new_page_num, cur_page_num);
+  *node_parent(cur) = new_page_num;
+  *internal_node_right_child(old_node) = INVALID_PAGE_NUM;
+  /*
+  中間キーに到達するまで、各キーと子を新ノードに移す
+  */
+  for (int i = INTERNAL_NODE_MAX_CELLS - 1; i > INTERNAL_NODE_MAX_CELLS / 2; i--) {
+    cur_page_num = *internal_node_child(old_node, i);
+    cur = get_page(table->pager, cur_page_num);
+
+    internal_node_insert(table, new_page_num, cur_page_num);
+    *node_parent(cur) = new_page_num;
+
+    (*old_num_keys)--;
+  }
+
+  /*
+  中間キーの前の子（今や最大キーになっている）をノードの右の子に設定し、
+  キーの数をデクリメントする
+  */
+  *internal_node_right_child(old_node) = *internal_node_child(old_node,*old_num_keys - 1);
+  (*old_num_keys)--;
+
+  /*
+  分割後の2つのノードのどちらに挿入すべき子を入れるか判断し、
+  子を挿入する
+  */
+  uint32_t max_after_split = get_node_max_key(table->pager, old_node);
+
+  uint32_t destination_page_num = child_max < max_after_split ? old_page_num : new_page_num;
+
+  internal_node_insert(table, destination_page_num, child_page_num);
+  *node_parent(child) = destination_page_num;
+
+  update_internal_node_key(parent, old_max, get_node_max_key(table->pager, old_node));
+
+  if (!splitting_root) {
+    internal_node_insert(table,*node_parent(old_node),new_page_num);
+    *node_parent(new_node) = *node_parent(old_node);
+  }
+}
+
```

最初に行う必要があるのは、分割するノード（以後、旧ノード）のページ番号を保存する変数の作成だ。テーブルのルートノードだった場合、ページ番号が変わるためだ。ノードの現在の最大値も記憶しておく必要がある。この値は親内でのキーを表しており、分割後の旧ノードの新しい最大値で更新する必要がある。

```diff
+  uint32_t old_page_num = parent_page_num;
+  void* old_node = get_page(table->pager,parent_page_num);
+  uint32_t old_max = get_node_max_key(table->pager, old_node);
```

次の重要なステップは、旧ノードがテーブルのルートノードかどうかに依存する分岐ロジックだ。この情報は後で使うために保存しておく必要がある。コメントが伝えようとしているように、ルートの分割でない場合、新しく作成された兄弟ノードをすぐに旧ノードの親に挿入することができない。まだキーを含んでいないため、親にすでに存在するかもしれない他のキー/子ペアの中で正しいインデックスに配置されないからだ。

```diff
+  uint32_t splitting_root = is_node_root(old_node);
+
+  void* parent;
+  void* new_node;
+  if (splitting_root) {
+    create_new_root(table, new_page_num);
+    parent = get_page(table->pager,table->root_page_num);
+    /*
+    ルートを分割する場合、old_nodeを新しいルートの左の子を指すよう
+    更新する必要がある。new_page_numは既に新しいルートの右の子を指している
+    */
+    old_page_num = *internal_node_child(parent,0);
+    old_node = get_page(table->pager, old_page_num);
+  } else {
+    parent = get_page(table->pager,*node_parent(old_node));
+    new_node = get_page(table->pager, new_page_num);
+    initialize_internal_node(new_node);
+  }
```

ルートの分割の有無が決まったら、旧ノードから兄弟ノードへのキーの移動を開始する。まず旧ノードの右の子を移動し、右の子フィールドを無効なページに設定して空であることを示す。次に、旧ノードの残りのキーをループし、各反復で以下を行う：
 1. 現在のインデックスの旧ノードのキーと子への参照を取得
 2. 子を兄弟ノードに挿入
 3. 子の親の値を兄弟ノードを指すよう更新
 4. 旧ノードのキー数をデクリメント

```diff
+  uint32_t* old_num_keys = internal_node_num_keys(old_node);
+
+  uint32_t cur_page_num = *internal_node_right_child(old_node);
+  void* cur = get_page(table->pager, cur_page_num);
+
+  /*
+  まず右の子を新ノードに入れ、旧ノードの右の子を無効なページ番号に設定する
+  */
+  internal_node_insert(table, new_page_num, cur_page_num);
+  *node_parent(cur) = new_page_num;
+  *internal_node_right_child(old_node) = INVALID_PAGE_NUM;
+  /*
+  中間キーに到達するまで、各キーと子を新ノードに移す
+  */
+  for (int i = INTERNAL_NODE_MAX_CELLS - 1; i > INTERNAL_NODE_MAX_CELLS / 2; i--) {
+    cur_page_num = *internal_node_child(old_node, i);
+    cur = get_page(table->pager, cur_page_num);
+
+    internal_node_insert(table, new_page_num, cur_page_num);
+    *node_parent(cur) = new_page_num;
+
+    (*old_num_keys)--;
+  }
```

ステップ4は重要だ。旧ノードからキー/子ペアを「消去」する役割を果たす。旧ノードのページにおけるそのバイトオフセットのメモリを実際に解放しているわけではないが、旧ノードのキー数をデクリメントすることで、そのメモリ位置にアクセスできなくなり、次に旧ノードに子が挿入された時にバイトが上書きされる。

ループ不変条件の動作にも注目してほしい。将来、内部ノードの最大キー数が変更された場合でも、旧ノードと兄弟ノードの両方が分割後に(n-1)/2個のキーを持ち、残りの1つが親に行くよう、ロジックが保証されている。偶数が最大ノード数として選ばれた場合、n/2個が旧ノードに残り、(n-1)/2個が兄弟ノードに移される。

移動すべきキーの移動が完了したら、旧ノードのi番目の子を右の子に設定し、キー数をデクリメントする。

```diff
+  /*
+  中間キーの前の子（今や最大キーになっている）をノードの右の子に設定し、
+  キーの数をデクリメントする
+  */
+  *internal_node_right_child(old_node) = *internal_node_child(old_node,*old_num_keys - 1);
+  (*old_num_keys)--;
```

次に、子ノードの最大キーの値に応じて、旧ノードまたは兄弟ノードのいずれかに子ノードを挿入する。

```diff
+  uint32_t max_after_split = get_node_max_key(table->pager, old_node);
+
+  uint32_t destination_page_num = child_max < max_after_split ? old_page_num : new_page_num;
+
+  internal_node_insert(table, destination_page_num, child_page_num);
+  *node_parent(child) = destination_page_num;
```

最後に、親内の旧ノードのキーを更新し、必要に応じて兄弟ノードを挿入して兄弟ノードの親ポインタを更新する。

```diff
+  update_internal_node_key(parent, old_max, get_node_max_key(table->pager, old_node));
+
+  if (!splitting_root) {
+    internal_node_insert(table,*node_parent(old_node),new_page_num);
+    *node_parent(new_node) = *node_parent(old_node);
+  }
```

この新しいロジックをサポートするために必要なもう1つの重要な変更は、`create_new_root`関数だ。以前は、新しいルートの子がリーフノードである場合のみを考慮していた。新しいルートの子が内部ノードの場合は、2つのことを追加で行う必要がある：
 1. ルートの新しい子を正しく内部ノードとして初期化する
 2. memcpyの呼び出しに加えて、ルートの各キーを新しい左の子に挿入し、各子の親ポインタを更新する

```diff
@@ -661,22 +680,40 @@ void create_new_root(Table* table, uint32_t right_child_page_num) {
   uint32_t left_child_page_num = get_unused_page_num(table->pager);
   void* left_child = get_page(table->pager, left_child_page_num);

+  if (get_node_type(root) == NODE_INTERNAL) {
+    initialize_internal_node(right_child);
+    initialize_internal_node(left_child);
+  }
+
   /* 左の子は旧ルートからデータをコピー */
   memcpy(left_child, root, PAGE_SIZE);
   set_node_root(left_child, false);

+  if (get_node_type(left_child) == NODE_INTERNAL) {
+    void* child;
+    for (int i = 0; i < *internal_node_num_keys(left_child); i++) {
+      child = get_page(table->pager, *internal_node_child(left_child,i));
+      *node_parent(child) = left_child_page_num;
+    }
+    child = get_page(table->pager, *internal_node_right_child(left_child));
+    *node_parent(child) = left_child_page_num;
+  }
+
   /* ルートノードは1つのキーと2つの子を持つ新しい内部ノード */
   initialize_internal_node(root);
   set_node_root(root, true);
   *internal_node_num_keys(root) = 1;
   *internal_node_child(root, 0) = left_child_page_num;
-  uint32_t left_child_max_key = get_node_max_key(left_child);
+  uint32_t left_child_max_key = get_node_max_key(table->pager, left_child);
   *internal_node_key(root, 0) = left_child_max_key;
   *internal_node_right_child(root) = right_child_page_num;
   *node_parent(left_child) = table->root_page_num;
   *node_parent(right_child) = table->root_page_num;
 }
```

もう1つの重要な変更は`get_node_max_key`だ。この記事の冒頭で触れたように、内部ノードのキーはその左にある子が指すツリーの最大値を表し、その子は任意の深さのツリーになり得る。そのため、そのツリーの右の子をリーフノードに到達するまでたどり、そのリーフノードの最大キーを取得する必要がある。

```diff
+uint32_t get_node_max_key(Pager* pager, void* node) {
+  if (get_node_type(node) == NODE_LEAF) {
+    return *leaf_node_key(node, *leaf_node_num_cells(node) - 1);
+  }
+  void* right_child = get_page(pager,*internal_node_right_child(node));
+  return get_node_max_key(pager, right_child);
+}
```

内部ノードの分割導入後も`print_tree`関数が正常に動作することを示すテストを1つ書いた。

```diff
+  it 'allows printing out the structure of a 7-leaf-node btree' do
+    script = [
+      "insert 58 user58 person58@example.com",
+      "insert 56 user56 person56@example.com",
+      "insert 8 user8 person8@example.com",
+      "insert 54 user54 person54@example.com",
+      "insert 77 user77 person77@example.com",
+      "insert 7 user7 person7@example.com",
+      "insert 25 user25 person25@example.com",
+      "insert 71 user71 person71@example.com",
+      "insert 13 user13 person13@example.com",
+      "insert 22 user22 person22@example.com",
+      "insert 53 user53 person53@example.com",
+      "insert 51 user51 person51@example.com",
+      "insert 59 user59 person59@example.com",
+      "insert 32 user32 person32@example.com",
+      "insert 36 user36 person36@example.com",
+      "insert 79 user79 person79@example.com",
+      "insert 10 user10 person10@example.com",
+      "insert 33 user33 person33@example.com",
+      "insert 20 user20 person20@example.com",
+      "insert 4 user4 person4@example.com",
+      "insert 35 user35 person35@example.com",
+      "insert 76 user76 person76@example.com",
+      "insert 49 user49 person49@example.com",
+      "insert 24 user24 person24@example.com",
+      "insert 70 user70 person70@example.com",
+      "insert 48 user48 person48@example.com",
+      "insert 39 user39 person39@example.com",
+      "insert 15 user15 person15@example.com",
+      "insert 47 user47 person47@example.com",
+      "insert 30 user30 person30@example.com",
+      "insert 86 user86 person86@example.com",
+      "insert 31 user31 person31@example.com",
+      "insert 68 user68 person68@example.com",
+      "insert 37 user37 person37@example.com",
+      "insert 66 user66 person66@example.com",
+      "insert 63 user63 person63@example.com",
+      "insert 40 user40 person40@example.com",
+      "insert 78 user78 person78@example.com",
+      "insert 19 user19 person19@example.com",
+      "insert 46 user46 person46@example.com",
+      "insert 14 user14 person14@example.com",
+      "insert 81 user81 person81@example.com",
+      "insert 72 user72 person72@example.com",
+      "insert 6 user6 person6@example.com",
+      "insert 50 user50 person50@example.com",
+      "insert 85 user85 person85@example.com",
+      "insert 67 user67 person67@example.com",
+      "insert 2 user2 person2@example.com",
+      "insert 55 user55 person55@example.com",
+      "insert 69 user69 person69@example.com",
+      "insert 5 user5 person5@example.com",
+      "insert 65 user65 person65@example.com",
+      "insert 52 user52 person52@example.com",
+      "insert 1 user1 person1@example.com",
+      "insert 29 user29 person29@example.com",
+      "insert 9 user9 person9@example.com",
+      "insert 43 user43 person43@example.com",
+      "insert 75 user75 person75@example.com",
+      "insert 21 user21 person21@example.com",
+      "insert 82 user82 person82@example.com",
+      "insert 12 user12 person12@example.com",
+      "insert 18 user18 person18@example.com",
+      "insert 60 user60 person60@example.com",
+      "insert 44 user44 person44@example.com",
+      ".btree",
+      ".exit",
+    ]
+    result = run_script(script)

+    expect(result[64...(result.length)]).to match_array([
+      "db > Tree:",
+      "- internal (size 1)",
+      "  - internal (size 2)",
+      "    - leaf (size 7)",
+      "      - 1",
+      "      - 2",
+      "      - 4",
+      "      - 5",
+      "      - 6",
+      "      - 7",
+      "      - 8",
+      "    - key 8",
+      "    - leaf (size 11)",
+      "      - 9",
+      "      - 10",
+      "      - 12",
+      "      - 13",
+      "      - 14",
+      "      - 15",
+      "      - 18",
+      "      - 19",
+      "      - 20",
+      "      - 21",
+      "      - 22",
+      "    - key 22",
+      "    - leaf (size 8)",
+      "      - 24",
+      "      - 25",
+      "      - 29",
+      "      - 30",
+      "      - 31",
+      "      - 32",
+      "      - 33",
+      "      - 35",
+      "  - key 35",
+      "  - internal (size 3)",
+      "    - leaf (size 12)",
+      "      - 36",
+      "      - 37",
+      "      - 39",
+      "      - 40",
+      "      - 43",
+      "      - 44",
+      "      - 46",
+      "      - 47",
+      "      - 48",
+      "      - 49",
+      "      - 50",
+      "      - 51",
+      "    - key 51",
+      "    - leaf (size 11)",
+      "      - 52",
+      "      - 53",
+      "      - 54",
+      "      - 55",
+      "      - 56",
+      "      - 58",
+      "      - 59",
+      "      - 60",
+      "      - 63",
+      "      - 65",
+      "      - 66",
+      "    - key 66",
+      "    - leaf (size 7)",
+      "      - 67",
+      "      - 68",
+      "      - 69",
+      "      - 70",
+      "      - 71",
+      "      - 72",
+      "      - 75",
+      "    - key 75",
+      "    - leaf (size 8)",
+      "      - 76",
+      "      - 77",
+      "      - 78",
+      "      - 79",
+      "      - 81",
+      "      - 82",
+      "      - 85",
+      "      - 86",
+      "db > ",
+    ])
+  end
```

---

<div align="center">

[← 前へ: Part 13 - 親ノードの更新](./part13.md) | [次へ: Part 15 - まとめ →](./part15.md)

</div>
