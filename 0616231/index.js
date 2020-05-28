var game = new Phaser.Game(400, 400, Phaser.AUTO, '',
//var game = new Phaser.Game(400, 400, Phaser.AUTO, "game",
    { preload: preload, create: create, update: update });
//創造長400寬400的遊戲畫面，Phaser.AUTO 表示使用預設的繪圖方式，"game"是告訴Phaser遊戲要放置在網頁的那個部分

var player;
var keyboard;

var platforms = []; //遊戲中平台是不斷生成和消失，因此不能用各自的變數去存放平台，必須用陣列來儲存

var leftWall;
var rightWall;
var ceiling;

var text1;
var text2;
var text3;

var distance = 0;
var status = 'running';

function preload () {

    game.load.baseURL = 'https://wacamoto.github.io/NS-Shaft-Tutorial/assets/'; //載入資源的來源
    game.load.crossOrigin = 'anonymous';
    game.load.spritesheet('player', 'player.png', 32, 32); //載入這張圖片並命名為player
    //spritesheet vs. image : spritesheet包含很多個分別的圖片，有助於減少儲存空間
    //32, 32 就是裁切的長和寬，編號是從0開始
    game.load.image('wall', 'wall.png');
    game.load.image('ceiling', 'ceiling.png');
    game.load.image('normal', 'normal.png');
    game.load.image('nails', 'nails.png');
    game.load.spritesheet('conveyorRight', 'conveyor_right.png', 96, 16);
    game.load.spritesheet('conveyorLeft', 'conveyor_left.png', 96, 16);
    game.load.spritesheet('trampoline', 'trampoline.png', 96, 22);
    game.load.spritesheet('fake', 'fake.png', 96, 36);
}

function create () {

    keyboard = game.input.keyboard.addKeys({ //創造鍵盤
        'enter': Phaser.Keyboard.ENTER,
        'up': Phaser.Keyboard.UP,
        'down': Phaser.Keyboard.DOWN,
        'left': Phaser.Keyboard.LEFT,
        'right': Phaser.Keyboard.RIGHT,
        'w': Phaser.Keyboard.W,
        'a': Phaser.Keyboard.A,
        's': Phaser.Keyboard.S,
        'd': Phaser.Keyboard.D
    });

    createBounders();
    createPlayer();
    createTextsBoard();
    //這裡不create platform
}

function update () {

    // bad
    if(status == 'gameOver' && keyboard.enter.isDown) restart();
    if(status != 'running') return;

    this.physics.arcade.collide(player, platforms, effect);
    //game.physics.arcade.collide(A,B)會判斷A,B否碰撞  //沒這行的話A和B不會有碰撞發生
    //增加第三個參數 effect 為碰撞時執行的函式
    this.physics.arcade.collide(player, [leftWall, rightWall]);
    checkTouchCeiling(player);
    checkGameOver();

    updatePlayer();
    updatePlatforms();
    updateTextsBoard();

    createPlatforms();
}

function createBounders () {
    leftWall = game.add.sprite(0, 0, 'wall'); //創造東東
    //game.add.sprite(x座標, y座標, 圖片)
    //在遊戲中的任何東西都可以稱為 Sprite (遊戲精靈)
    //sprite 座標點在圖片的左上角
    game.physics.arcade.enable(leftWall);
    //啟用player的物理特性，例如移動、碰撞等，但如果只是想顯示一張圖片例如背景圖，在遊戲中不需要互動就不用掛載物理引擎
    leftWall.body.immovable = true;
    //immovable=true 表示設定牆壁為固定
    //設為false的話 人碰到牆 會把牆推走
    rightWall = game.add.sprite(383, 0, 'wall');
    game.physics.arcade.enable(rightWall);
    rightWall.body.immovable = true;

    ceiling = game.add.image(0, 0, 'ceiling');
}

var lastTime = 0;
function createPlatforms () { //要產生一個新的 platform 了
    if(game.time.now > lastTime + 600) { //game.time.now 可以取得遊戲開始到現在的時間
        lastTime = game.time.now;
        createOnePlatform();
        distance += 1;
    }
}

function createOnePlatform () { //要產生哪一種 platform

    var platform;
    var x = Math.random()*(400 - 96 - 40) + 20;
    var y = 400;
    var rand = Math.random() * 100; //Math.random()會產生0~1的隨機數字，乘上100就會產生 "0~100" 的隨機數字

    if(rand < 20) {
        platform = game.add.sprite(x, y, 'normal');
    } else if (rand < 40) {
        platform = game.add.sprite(x, y, 'nails');
        game.physics.arcade.enable(platform);
        platform.body.setSize(96, 15, 0, 15);
    } else if (rand < 50) {
        platform = game.add.sprite(x, y, 'conveyorLeft');
        platform.animations.add('scroll', [0, 1, 2, 3], 16, true);
        //"幫角色增加動畫"
        //Sprite.animations.add(動畫名字, 影格, 每秒禎數)
        //第四個參數為true時，動畫會不斷播放
        platform.play('scroll'); //請開始scroll而且不要停喔
    } else if (rand < 60) {
        platform = game.add.sprite(x, y, 'conveyorRight');
        platform.animations.add('scroll', [0, 1, 2, 3], 16, true);
        platform.play('scroll');
    } else if (rand < 80) {
        platform = game.add.sprite(x, y, 'trampoline');
        platform.animations.add('jump', [4, 5, 4, 3, 2, 1, 0, 1, 2, 3], 120);
        platform.frame = 3;
    } else {
        platform = game.add.sprite(x, y, 'fake');
        platform.animations.add('turn', [0, 1, 2, 3, 4, 5, 0], 14);
    }

    game.physics.arcade.enable(platform);
    platform.body.immovable = true;
    platforms.push(platform);

    platform.body.checkCollision.down = false;
    platform.body.checkCollision.left = false;
    platform.body.checkCollision.right = false;
}

function createPlayer() {
    player = game.add.sprite(200, 50, 'player');
    game.physics.arcade.enable(player);
    player.body.gravity.y = 500; //施加引力在角色身上 //他並不是從畫面的最頂掉下來，是在一開始的座標開始掉下
    player.animations.add('left', [0, 1, 2, 3], 8);
    player.animations.add('right', [9, 10, 11, 12], 8);
    player.animations.add('flyleft', [18, 19, 20, 21], 12);
    player.animations.add('flyright', [27, 28, 29, 30], 12);
    player.animations.add('fly', [36, 37, 38, 39], 12);
    player.life = 10; //存放玩家的生命
    player.unbeatableTime = 0; //角色無敵狀態的時間
    player.touchOn = undefined; //記錄碰撞的物體, 防止重複觸法事件 //紀錄碰撞的平台
}

function createTextsBoard () {
    var style = {fill: '#ff0000', fontSize: '20px'}
    text1 = game.add.text(10, 10, '', style);
    //"創造文字物件"
    //game.add.text(x座標, y座標, 文字內容)
    text2 = game.add.text(350, 10, '', style);
    text3 = game.add.text(140, 200, 'Enter 重新開始', style);
    text3.visible = false;
}

function updatePlayer () {
    if(keyboard.left.isDown) { //當左鍵被按下時
        player.body.velocity.x = -250;
    } else if(keyboard.right.isDown) {
        player.body.velocity.x = 250;
    } else {
        player.body.velocity.x = 0;
    }
    setPlayerAnimate(player);
}

function setPlayerAnimate(player) {
    var x = player.body.velocity.x;
    var y = player.body.velocity.y;

    if (x < 0 && y > 0) {
        player.animations.play('flyleft');
        //"播放動畫"
        //Sprite.play(動畫名字)
    }
    if (x > 0 && y > 0) {
        player.animations.play('flyright');
    }
    if (x < 0 && y == 0) {
        player.animations.play('left');
    }
    if (x > 0 && y == 0) {
        player.animations.play('right');
    }
    if (x == 0 && y != 0) {
        player.animations.play('fly');
    }
    if (x == 0 && y == 0) {
      player.frame = 8; 
      //"設定外觀"
      //設定外觀為圖片編號8的部分
    }
}

function updatePlatforms () {
    for(var i=0; i<platforms.length; i++) {
        var platform = platforms[i];
        platform.body.position.y -= 2;
        if(platform.body.position.y <= -20) {   //記住：越往上走是越負
            platform.destroy(); //銷毀platform平台
            platforms.splice(i, 1); //從陣列移除第i個平台
        }
    }
}

function updateTextsBoard () {
    text1.setText('life:' + player.life);
    //setText: "動態修改文字的內容"
    text2.setText('B' + distance);
}

function effect(player, platform) {
//傳入的參數是碰撞的兩個 Sprite
    if(platform.key == 'conveyorRight') { //platform.key 會是 sprite 的圖片名字
        conveyorRightEffect(player, platform);
    }
    if(platform.key == 'conveyorLeft') {
        conveyorLeftEffect(player, platform);
    }
    if(platform.key == 'trampoline') {
        trampolineEffect(player, platform);
    }
    if(platform.key == 'nails') {
        nailsEffect(player, platform);
    }
    if(platform.key == 'normal') {
        basicEffect(player, platform);
    }
    if(platform.key == 'fake') {
        fakeEffect(player, platform);
    }
}

function conveyorRightEffect(player, platform) { //輸送帶的轉動效果
    player.body.x += 2; //更新sprite的座標 
}

function conveyorLeftEffect(player, platform) { //輸送帶的轉動效果
    player.body.x -= 2;
}

function trampolineEffect(player, platform) {
    platform.animations.play('jump'); //這個"jump"是彈簧的動畫，不是人的上下跳
    player.body.velocity.y = -350; //每跟彈簧碰撞一次，就跑一次這個  //設定速度 每秒移動Y距離-350
}

function nailsEffect(player, platform) {
    if (player.touchOn !== platform) {
        player.life -= 3;
        player.touchOn = platform;
        game.camera.flash(0xff0000, 100);
    }
}

function basicEffect(player, platform) {
    if (player.touchOn !== platform) {
        if(player.life < 10) {
            player.life += 1;
        }
        player.touchOn = platform;
    }
}

function fakeEffect(player, platform) {
    if(player.touchOn !== platform) {
        platform.animations.play('turn');
        setTimeout(function() {
            platform.body.checkCollision.up = false;
        }, 100);
        player.touchOn = platform;
    }
}

function checkTouchCeiling(player) {
    if(player.body.y < 0) {
        if(player.body.velocity.y < 0) {
            player.body.velocity.y = 0;
        }
        if(game.time.now > player.unbeatableTime) {
            player.life -= 3;
            game.camera.flash(0xff0000, 100);
            player.unbeatableTime = game.time.now + 2000;
        }
    }
}

function checkGameOver () {
    if(player.life <= 0 || player.body.y > 500) {
        gameOver();
    }
}

function gameOver () {
    text3.visible = true;
    platforms.forEach(function(s) {s.destroy()});
    platforms = [];
    status = 'gameOver';
}

function restart () {
    text3.visible = false;
    distance = 0;
    createPlayer();
    status = 'running';
}
